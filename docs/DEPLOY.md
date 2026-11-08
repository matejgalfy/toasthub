# Toasthub — Deployment runbook

How to run Toasthub on Kubernetes: a local cluster for trying it out, the production cluster, deploys,
backups and restores. The choices behind it are in SPEC §12 (D12, D14, D15, D59, D60).

## What runs where

```
k3s node ── Traefik (ingress, TLS) ──▶ /api → api ──▶ Postgres (CloudNativePG) ──▶ backups: S3
                                      /    → web          ▲
                                                          └── worker (1 pod): cron jobs
                                      migrate Job: once per deploy, before the new pods
           (prod) s3.<host> ─────────▶ MinIO: photos (presigned URLs) and backups
```

api and web run 2 pods each in the base and 1 each in prod, where the VM is shared with FitBond.

| Path                                      | What                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/k8s/base/`                         | The app in namespace `toasthub`: Deployments, Services, Ingress, ConfigMap, migration Job, Postgres `Cluster` + `ObjectStore` + `ScheduledBackup` |
| `infra/k8s/minio/`                        | MinIO, its volume and the bucket Job; used by both overlays                                                                                       |
| `infra/k8s/overlays/dev/`                 | Local cluster: MinIO and Mailpit in-cluster, plain dev Secrets, local images                                                                      |
| `infra/k8s/overlays/prod/`                | Production: `toasthub.live`, TLS, HSTS, MinIO behind `s3.toasthub.live`, Sealed Secrets                                                           |
| `infra/k8s/cluster/install-operators.sh`  | Once per cluster: cert-manager, CloudNativePG + Barman Cloud plugin, Sealed Secrets                                                               |
| `infra/k8s/cluster/dev/`, `cluster/prod/` | Once per cluster: k3d config + CoreDNS rewrite (dev); Let's Encrypt issuer + Traefik settings (prod)                                              |
| `infra/k8s/deploy.sh <dev\|prod> [tag]`   | Every deploy: migrations first, then the rollout                                                                                                  |
| `infra/k8s/seal-secrets.sh <dir>`         | Encrypts the prod secrets into `overlays/prod/sealed-secrets.yaml`                                                                                |
| `.github/workflows/deploy.yml`            | The same deploy from GitHub Actions, started by hand                                                                                              |

Every script uses the **current kubectl context**. Check it with `kubectl config current-context` before you run
one, or point `KUBECONFIG` at the cluster's own file.

Tools: Docker, `kubectl` ≥ 1.30 (Docker Desktop ships one), [k3d](https://k3d.io) 5.9 for the local cluster,
[`kubeseal`](https://github.com/bitnami/sealed-secrets/releases) 0.41 for prod secrets. Run the scripts from Git
Bash on Windows.

## Local cluster (dev overlay)

Everything runs inside one k3d cluster; the app is at http://localhost:8080. Stop the compose `prod` profile
first: it also uses port 8080.

```sh
# 1. Cluster (its own kubeconfig file, so your other contexts stay as they are)
k3d cluster create --config infra/k8s/cluster/dev/k3d.yaml --kubeconfig-update-default=false
export KUBECONFIG="$(k3d kubeconfig write toasthub)"

# 2. Once per cluster
infra/k8s/cluster/install-operators.sh
kubectl apply -f infra/k8s/cluster/dev/coredns-custom.yaml

# 3. Images, built from the working tree and copied into the cluster (no registry)
docker build -f infra/docker/api.Dockerfile -t toasthub-api:local .
docker build -f infra/docker/web.Dockerfile -t toasthub-web:local .
k3d image import toasthub-api:local toasthub-web:local --cluster toasthub

# 4. Deploy (the first run waits a minute or two for Postgres)
infra/k8s/deploy.sh dev
```

- App: http://localhost:8080. Magic-link mails: http://mailpit.localhost:8080. Photos load from
  http://minio.localhost:8080 (`*.localhost` is the loopback in browsers; inside the cluster CoreDNS rewrites
  the name to the MinIO Service, so the api signs for the same host).
- After a code change: build and import the images again, then `kubectl -n toasthub rollout restart
deployment/api deployment/worker deployment/web` (the tag `local` doesn't change, so `deploy.sh` alone doesn't
  restart pods). Run `deploy.sh dev` again when a migration was added.
- First admin: `kubectl -n toasthub exec deploy/api -- node dist/modules/admin/promote-admin.js <email>` (sign
  in once first).
- Backups go to the `toasthub-backups` bucket in the in-cluster MinIO, so the restore below can be tried locally.
- E2E against the cluster: forward its database and Mailpit, then point the suite at them:
  ```sh
  kubectl -n toasthub port-forward svc/postgres-rw 15432:5432 &
  kubectl -n toasthub port-forward svc/mailpit 18025:8025 &
  PW=$(kubectl -n toasthub get secret postgres-app -o jsonpath='{.data.password}' | base64 -d)
  E2E_WEB_URL=http://localhost:8080 E2E_API_URL=http://localhost:8080 MAILPIT_URL=http://127.0.0.1:18025 \
    DATABASE_URL="postgres://toasthub:$PW@127.0.0.1:15432/toasthub" bun run e2e
  ```
- Remove everything: `k3d cluster delete toasthub`.

## Production

**[toasthub.live](https://toasthub.live)** runs in the k3s cluster of the Azure VM that also runs
FitBond (its runbook: `docs/DEPLOY.md` in the `fit-bond` repo), in its own namespace `toasthub` (SPEC §12 D63,
D65). Photos and database backups are in MinIO inside the cluster; its S3 API is public at `s3.toasthub.live`,
because browsers load photos from presigned URLs on it. Mail goes through Resend, from FitBond's domain
`fitbond.me`. The commands below run **on
the VM** (`ssh <user>@<vm>`), where `kubectl` uses `~/.kube/config`.

### One-time setup

1. **Cluster.** FitBond's setup already installed k3s, cert-manager, the `letsencrypt` ClusterIssuer and the
   Traefik settings (`infra/k8s/cluster/prod/` holds the same two files, for a new cluster only). Toasthub adds
   about 1.5 GB of memory; check `free -h` and `kubectl top nodes` first.
2. **DNS** (name.com → My Domains → `toasthub.live` → Manage DNS Records, on name.com's own nameservers):
   delete the parking records name.com adds, then two `A` records to the VM's public IP, Host empty (the root)
   and Host `s3`. Wait until both resolve, or the certificates keep failing for a while:
   ```sh
   dig +short toasthub.live A @1.1.1.1      # the VM's IP
   dig +short s3.toasthub.live A @1.1.1.1
   ```
3. **Resend.** The free plan has one domain, so Toasthub sends from FitBond's `fitbond.me` (DNS at Namecheap).
   Add the domain and create the DNS records it lists in Namecheap: in the Host field only the part before
   `.fitbond.me` (`resend._domainkey`, `send`); an `MX` record needs Mail Settings → Custom MX. Verify, then
   create an API key with sending access. The overlay's `MAIL_FROM` is `toasthub@fitbond.me`.
4. **Repo and operators.**
   ```sh
   git clone https://github.com/matejgalfy/toasthub.git ~/toasthub && cd ~/toasthub
   infra/k8s/cluster/install-operators.sh   # same cert-manager as FitBond; adds CloudNativePG, Barman, Sealed Secrets
   ```
5. **kubeseal** (the version of the controller):
   ```sh
   curl -fsSL https://github.com/bitnami/sealed-secrets/releases/download/v0.41.2/kubeseal-0.41.2-linux-amd64.tar.gz |
     tar -xz kubeseal && sudo install -m 755 kubeseal /usr/local/bin/ && rm kubeseal
   ```
6. **Secrets.** Three env files in a folder outside the repo. The app and the backups use MinIO's root
   credentials (MinIO serves only Toasthub). No quotes around values; they are read literally.
   ```sh
   mkdir -m 700 ~/toasthub-secrets && cd ~/toasthub-secrets
   RESEND_API_KEY=re_...                    # from step 3
   MINIO_PASSWORD=$(openssl rand -hex 24)
   cat > app.env <<EOF
   BETTER_AUTH_SECRET=$(openssl rand -base64 32)
   SMTP_URL=smtps://resend:$RESEND_API_KEY@smtp.resend.com:465
   S3_ACCESS_KEY_ID=toasthub
   S3_SECRET_ACCESS_KEY=$MINIO_PASSWORD
   EOF
   printf 'ACCESS_KEY_ID=toasthub\nACCESS_SECRET_KEY=%s\n' "$MINIO_PASSWORD" > backup.env
   printf 'MINIO_ROOT_USER=toasthub\nMINIO_ROOT_PASSWORD=%s\n' "$MINIO_PASSWORD" > minio.env
   chmod 600 *.env
   # Without this key a rebuilt cluster can't read the committed secrets any more.
   kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > sealed-secrets-key.yaml
   cd ~/toasthub && infra/k8s/seal-secrets.sh ~/toasthub-secrets
   ```
   Copy the folder to your PC and keep it like a password, never in git. Commit the sealed file from your PC
   (the VM's checkout has no push rights), then reset the VM's copy:
   ```sh
   # on the PC: cd into the repo first, the second scp's target is relative to it
   # "$HOME", not ~: PowerShell passes ~ to scp.exe unexpanded
   scp -r <user>@<vm>:toasthub-secrets "$HOME/toasthub-secrets"
   scp <user>@<vm>:toasthub/infra/k8s/overlays/prod/sealed-secrets.yaml infra/k8s/overlays/prod/
   git commit -am "build(infra): seal the prod secrets" && git push
   # on the VM
   cd ~/toasthub && git checkout -- . && git pull
   ```
   To change one value later, edit the env file on the VM, run `seal-secrets.sh` again and commit the result.
7. **Images.** CI pushes `ghcr.io/matejgalfy/toasthub-api|web` on every `main` push. New GHCR packages are
   private: make both public (package settings → visibility), or the cluster can't pull them.
8. **First deploy.** Once CI on that commit is green (its images exist):
   ```sh
   cd ~/toasthub && git pull && infra/k8s/deploy.sh prod "$(git rev-parse HEAD)"
   kubectl -n toasthub get pods,certificate     # all Running; both certificates READY=True after a minute or two
   ```
9. **First admin.** Sign in once at https://toasthub.live, then
   `kubectl -n toasthub exec deploy/api -- node dist/modules/admin/promote-admin.js <email>`.
10. **Check.** Log a toast with a photo (it loads from `s3.toasthub.live`), and
    `kubectl -n toasthub get backups` shows the first base backup as `completed`.

### Deploying a new version

`deploy.sh` is the only way to deploy (a plain `kubectl apply -k` would fail on the migration Job, whose
template can't change, and would skip the migration step):

1. applies everything but the api, worker and web Deployments, after deleting the previous `migrate` Job,
2. waits for the new `migrate` Job; if it fails, it prints its log and stops, and the old pods keep serving,
3. applies the Deployments and waits for their rolling update.

On the VM: `cd ~/toasthub && git pull && infra/k8s/deploy.sh prod "$(git rev-parse HEAD)"`. Only deploy a SHA
whose CI run on `main` went green, so its images exist. From GitHub instead: **Actions → Deploy → Run
workflow** with the SHA (empty = the head of the chosen branch). The workflow needs a `production` environment
with the secrets listed at the top of `.github/workflows/deploy.yml` (`SSH_KNOWN_HOSTS` from
`ssh-keyscan <host>`, `KUBECONFIG_DATA` = the k3s kubeconfig with `server: https://127.0.0.1:6443`).

Rollback: deploy the previous SHA. Migrations don't roll back, so keep them **backwards compatible** with the
version before (add columns and tables; drop or rename only in a later release, once no running version reads
them). During a rolling update old and new pods share the database for a moment anyway.

### Configuration

Non-secret settings are the `toasthub-config` ConfigMap (base + the overlay's `configMapGenerator`); a change
rolls the pods on the next deploy. Secrets are `toasthub-app` (app), `toasthub-backup` (Barman) and
`minio-root` (MinIO), and
`DATABASE_URL` comes from `postgres-app`, which CloudNativePG creates. Every variable is described in
`apps/api/.env.example`.

The email domains that may sign in are `ALLOWED_EMAIL_DOMAINS` in `infra/k8s/overlays/prod/kustomization.yaml`
(SPEC BR-AUTH-6). To change them, edit that line, commit and deploy (`deploy.sh prod <sha>`); the image stays
the same.

## Backups and restore

CloudNativePG archives every WAL segment and takes a base backup daily at 02:30 UTC (plus one right after the
cluster is created) into the `backups` ObjectStore: `s3://toasthub-backups/postgres/`, kept 14 days (SPEC §10).
Check them:

```sh
kubectl -n toasthub get backups                    # one per day, phase "completed"
kubectl -n toasthub get cluster postgres -o jsonpath='{.status.conditions}'   # ContinuousArchiving = True
```

In prod the backups and the photos share the VM's disk with the database (MinIO in the cluster, D63), so a lost
VM loses them all. Copy the MinIO volume to your PC now and then:

```sh
# on the VM
sudo tar -czf ~/toasthub-minio-$(date +%F).tar.gz /var/lib/rancher/k3s/storage/*_toasthub_minio-data
# on the PC
scp '<user>@<vm>:toasthub-minio-*.tar.gz' . && ssh <user>@<vm> 'rm ~/toasthub-minio-*.tar.gz'
```

Take one by hand (e.g. before a risky migration):

```sh
kubectl -n toasthub apply -f - <<'EOF'
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata: { name: manual-<date> }
spec:
  cluster: { name: postgres }
  method: plugin
  pluginConfiguration: { name: barman-cloud.cloudnative-pg.io }
EOF
```

### Restore to a point in time (PITR)

A restore always creates a **new** Postgres cluster from the base backup plus the WAL up to the target time.
A WAL segment is archived when it is full or after 5 minutes (CloudNativePG's `archive_timeout`), so the newest
few minutes may not be in the archive yet. To include everything up to now, first run
`kubectl -n toasthub exec postgres-1 -c postgres -- psql -c 'select pg_switch_wal()'` and give it a few seconds.

**Try it next to the live database** (safe; do this to check the backups, SPEC §10 wants it once before launch):

```sh
kubectl -n toasthub apply -f - <<'EOF'
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: postgres-restore }
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:18.6-minimal-trixie
  storage: { size: 10Gi }
  bootstrap:
    recovery:
      source: origin
      # Leave recoveryTarget out to replay everything archived.
      recoveryTarget: { targetTime: '2026-11-02T08:00:00Z' }
  externalClusters:
    - name: origin
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters: { barmanObjectName: backups, serverName: postgres }
EOF
kubectl -n toasthub get cluster postgres-restore -w     # until "Cluster in healthy state"
kubectl -n toasthub exec postgres-restore-1 -c postgres -- psql toasthub -c 'select count(*), max(created_at) from toast'
kubectl -n toasthub delete cluster postgres-restore     # also deletes its volume
```

The test cluster has no `plugins` section, so it archives nothing and leaves the backups alone.

**Replace the live database** (data loss after the target time; check the steps above worked first). Each
cluster archives into its own folder, its **server name**: `postgres/` at first, then `postgres-r1/`,
`postgres-r2/`, … after each replace. A new cluster can't archive into a folder that isn't empty.

1. Stop writers: `kubectl -n toasthub scale deployment api worker --replicas=0`. To keep everything up to now,
   run `select pg_switch_wal()` as above and wait until `select last_archived_wal from pg_stat_archiver`
   shows a new segment.
2. Write the new `Cluster` from the overlay, so storage size and resources match (a volume can't shrink, so a
   bigger size than the overlay's makes every later deploy fail):
   `kubectl kustomize infra/k8s/overlays/<dev|prod>` → copy the `Cluster` named `postgres` into a file outside
   the repo, then change three things:
   ```yaml
   bootstrap:
     recovery:
       source: origin
       # Without these the operator makes `postgres-app` for a user `app`, which the backup doesn't have.
       database: toasthub
       owner: toasthub
       # recoveryTarget: { targetTime: '…' }   # optional, as in the test above
   externalClusters:
     - name: origin
       plugin:
         name: barman-cloud.cloudnative-pg.io
         # The folder that holds the backups now: postgres, or the last postgres-rN.
         parameters: { barmanObjectName: backups, serverName: postgres }
   plugins:
     - name: barman-cloud.cloudnative-pg.io
       isWALArchiver: true
       # The next free folder.
       parameters: { barmanObjectName: backups, serverName: postgres-r1 }
   ```
3. Delete the cluster (this deletes its volume and the `postgres-app` Secret):
   `kubectl -n toasthub delete cluster postgres`, then `kubectl -n toasthub apply -f <that file>`.
4. Wait for "Cluster in healthy state" (about a minute for a small database), then check the data, that
   `ContinuousArchiving` is `True` (`get cluster postgres -o jsonpath='{.status.conditions}'`), and that the app
   user works: `kubectl -n toasthub get secret postgres-app -o jsonpath='{.data.username}' | base64 -d` is
   `toasthub`.
5. Take a base backup right away (the manual `Backup` above): the new folder has none until 02:30 UTC, and
   until it has one a later restore can't start from it.
6. Set `serverName: postgres-r1` under `plugins` in `infra/k8s/base/postgres.yaml`, commit, and run
   `deploy.sh`. The operator keeps a running cluster's data when its `bootstrap` goes back to `initdb`; it doesn't
   even restart the pod. The api and worker scale back up with the deploy.

Same cluster name and host, so the app needs no change. `postgres-app` is made again with a new password;
the pods read it when they start, which they do in step 6.

**Rehearsed on 2026-11-02** (M20, local k3d cluster, the dev overlay): 1,036 users and 364,569 toasts, a
marker row written seconds before the WAL switch. Restored `postgres` → `postgres-r1` (healthy in 73 s,
counts and marker back, app user signs in, archiving on), took the base backup, then restored again from
`postgres-r1` → `postgres-r2` (51 s, a second marker back) and applied the overlay's `Cluster` with
`serverName: postgres-r2`: accepted, no restart, data kept. The first try used a hand-written `Cluster` with
10Gi against the dev overlay's 2Gi; the webhook then refused the overlay's spec ("can't shrink existing
storage"), hence step 2.

## Performance

SPEC §10 asks for p95 API < 300 ms and LCP < 2.5 s on a 4G mid-range phone. The checks are Playwright tests
in `e2e/perf/` with their own config; they are not part of `bun run e2e` or CI, because they need the
production build and a filled database. Run them against the local cluster (or the compose `prod` profile):

```sh
# data: the dev seed, then 1,000 users with a year of toasts (~360k)
kubectl -n toasthub port-forward svc/postgres-rw 15432:5432 &
PW=$(kubectl -n toasthub get secret postgres-app -o jsonpath='{.data.password}' | base64 -d)
DATABASE_URL="postgres://toasthub:$PW@127.0.0.1:15432/toasthub" bun run db:seed
kubectl -n toasthub exec -i postgres-1 -c postgres -- psql toasthub < e2e/perf/bulk-data.sql

kubectl -n toasthub port-forward svc/mailpit 18025:8025 &
MAILPIT_URL=http://127.0.0.1:18025 bun run --filter @toasthub/e2e perf   # PERF_URL defaults to :8080
```

They sign in once as `ann@example.com` (`PERF_EMAIL` to change it; the per-email limit allows 5 sign-ins an
hour), then:

- **API:** 300 GETs per endpoint, 10 in flight, after a warm-up; p95 of each must stay under 300 ms.
- **LCP:** each page in a fresh browser context (cold cache, no service worker), 4× CPU slowdown, on "4G"
  (9 Mbit/s, 170 ms RTT, enforced) and Lighthouse's "slow 4G" (1.6 Mbit/s, 150 ms RTT, only reported).

Results on 2026-11-02 (M20; k3d on a Windows laptop, dev overlay, 1 api replica, the data above):

| API endpoint                       | p50 ms | p95 ms |
| ---------------------------------- | -----: | -----: |
| `/me`                              |     23 |     33 |
| `/home`                            |     46 |     57 |
| `/me/toast-sessions`               |     28 |     36 |
| `/leaderboards/users?period=week`  |     23 |     32 |
| `/leaderboards/users?period=year`  |    122 |    161 |
| `/leaderboards/clans?period=month` |     28 |     40 |
| `/users/:id`, `/stats`, `/heatmap` |  24–26 |  32–34 |
| `/clans/:id`, `/feed`              |  29–42 |  38–57 |

| Page            | LCP 4G | LCP slow 4G |
| --------------- | -----: | ----------: |
| `/`             |   1208 |        2664 |
| `/login`        |   1460 |        2348 |
| `/home`         |   1824 |        2900 |
| `/leaderboards` |   1500 |        2660 |

On `/home` the LCP element is the Toast of the week photo, after `/me` → `/home` → the photo, one after the
other; it loads eagerly with high priority. On slow 4G the 250 kB (gzip) bundle is the limit; see SPEC §12 D62
for what was tried. The yearly user leaderboard is the slowest query: watch it as the data grows.

## Troubleshooting

| Symptom                                      | Look at                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy.sh` waits for migrations a long time | `kubectl -n toasthub get cluster,pods`: the database isn't up yet, or `postgres-app` doesn't exist yet                                                                          |
| Pods `ImagePullBackOff`                      | GHCR package still private, or no images for that SHA (CI not green)                                                                                                            |
| Pods `CreateContainerConfigError`            | A Secret is missing: unsealed (wrong cluster key?) or `postgres-app` not made yet                                                                                               |
| No certificate / browser warning             | `kubectl -n toasthub get certificate,challenges`; DNS must point at the server, port 80 open                                                                                    |
| Photos don't load                            | Browser console: CSP `img-src` must equal `S3_ENDPOINT`; presigned URLs must use that host                                                                                      |
| Backups not completing                       | `kubectl -n toasthub logs postgres-1 -c plugin-barman-cloud`; `toasthub-backup` must match `minio-root`                                                                         |
| Photo upload fails (500), photos 404         | The api reaches MinIO through `S3_ENDPOINT` (the VM's public IP): `kubectl -n toasthub get certificate` (`toasthub-s3-tls` READY), `kubectl -n toasthub logs job/minio-buckets` |
| Magic link mail doesn't arrive               | `kubectl -n toasthub logs deploy/api` (SMTP error); the domain must be **Verified** in Resend and match `MAIL_FROM`                                                             |
| Logs                                         | `kubectl -n toasthub logs deploy/api` (JSON, one line per request with its request ID)                                                                                          |
