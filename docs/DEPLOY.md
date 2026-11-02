# Toasthub — Deployment runbook

How to run Toasthub on Kubernetes: a local cluster for trying it out, the production cluster, deploys,
backups and restores. The choices behind it are in SPEC §12 (D12, D14, D15, D59, D60).

## What runs where

```
k3s node ── Traefik (ingress, TLS) ──▶ /api → api (2 pods) ──▶ Postgres (CloudNativePG) ──▶ backups: S3
                                      /    → web (2 pods)          ▲
                                                                   └── worker (1 pod): cron jobs
                                      migrate Job: once per deploy, before the new pods
```

| Path                                      | What                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/k8s/base/`                         | The app in namespace `toasthub`: Deployments, Services, Ingress, ConfigMap, migration Job, Postgres `Cluster` + `ObjectStore` + `ScheduledBackup` |
| `infra/k8s/overlays/dev/`                 | Local cluster: MinIO and Mailpit in-cluster, plain dev Secrets, local images                                                                      |
| `infra/k8s/overlays/prod/`                | Production: domain, TLS, HSTS, Cloudflare R2, Sealed Secrets                                                                                      |
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

### One-time setup

1. **Server.** A Linux VM with at least 4 GB RAM (SPEC §14 Q2). Open ports 22, 80 and 443 only; the k3s API
   (6443) stays closed, deploys reach it through SSH. Install k3s: `curl -sfL https://get.k3s.io | sh -`. Copy
   `/etc/rancher/k3s/k3s.yaml` to your machine as the cluster's kubeconfig and reach it with
   `ssh -fN -L 6443:127.0.0.1:6443 <user>@<host>`.
2. **Domain.** An `A` record for the app's domain to the VM's public IP.
3. **Cloudflare R2.** Two private buckets, `toasthub-photos` and `toasthub-backups`, and an R2 API token with
   read/write on both. Note the account ID (the endpoint is `https://<account id>.r2.cloudflarestorage.com`),
   the access key ID and the secret.
4. **Resend.** Verify the domain, create an SMTP API key. `SMTP_URL` is
   `smtps://resend:<api key>@smtp.resend.com:465`.
5. **Cluster pieces.** With the kubeconfig active:
   ```sh
   infra/k8s/cluster/install-operators.sh
   kubectl apply -f infra/k8s/cluster/prod/traefik-config.yaml   # keeps client IPs for the per-IP limits
   # fill in your email first
   kubectl apply -f infra/k8s/cluster/prod/cluster-issuer.yaml
   ```
6. **Placeholders.** In `infra/k8s/overlays/prod/kustomization.yaml` replace `REPLACE_ME_DOMAIN` (e.g.
   `toasthub.example.com`, no scheme) and `REPLACE_ME_R2_ACCOUNT_ID`.
7. **Secrets.** In a folder **outside the repo** create two files:
   ```sh
   # app.env
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   SMTP_URL=smtps://resend:<api key>@smtp.resend.com:465
   S3_ACCESS_KEY_ID=<R2 access key id>
   S3_SECRET_ACCESS_KEY=<R2 secret>
   # backup.env (the same R2 token works)
   ACCESS_KEY_ID=<R2 access key id>
   ACCESS_SECRET_KEY=<R2 secret>
   ```
   Then `infra/k8s/seal-secrets.sh <that folder>` rewrites `overlays/prod/sealed-secrets.yaml`. Commit it; only
   this cluster's controller can decrypt it. Also back up the controller's key, or a rebuilt cluster can't read
   the committed secrets any more:
   `kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > sealed-secrets-key.yaml`
   (store it like a password, never in git). To change one value later, edit the env file and run the script
   again.
8. **Images.** CI pushes `ghcr.io/matejgalfy/toasthub-api|web` on every `main` push. New GHCR packages are
   private: make both public (package settings → visibility), or the cluster can't pull them.
9. **First deploy**, then make the first admin as in the dev section:
   ```sh
   infra/k8s/deploy.sh prod <full commit SHA of a green main build>
   ```

### Deploying a new version

`deploy.sh` is the only way to deploy (a plain `kubectl apply -k` would fail on the migration Job, whose
template can't change, and would skip the migration step):

1. applies everything but the api, worker and web Deployments, after deleting the previous `migrate` Job,
2. waits for the new `migrate` Job; if it fails, it prints its log and stops, and the old pods keep serving,
3. applies the Deployments and waits for their rolling update.

From your machine: `infra/k8s/deploy.sh prod <sha>`. From GitHub: **Actions → Deploy → Run workflow** with the
SHA (empty = the head of the chosen branch). The workflow needs a `production` environment with the secrets
listed at the top of `.github/workflows/deploy.yml` (`SSH_KNOWN_HOSTS` from `ssh-keyscan <host>`,
`KUBECONFIG_DATA` = the k3s kubeconfig with `server: https://127.0.0.1:6443`). Only deploy a SHA whose CI run on
`main` went green, so its images exist.

Rollback: deploy the previous SHA. Migrations don't roll back, so keep them **backwards compatible** with the
version before (add columns and tables; drop or rename only in a later release, once no running version reads
them). During a rolling update old and new pods share the database for a moment anyway.

### Configuration

Non-secret settings are the `toasthub-config` ConfigMap (base + the overlay's `configMapGenerator`); a change
rolls the pods on the next deploy. Secrets are `toasthub-app` (app) and `toasthub-backup` (Barman), and
`DATABASE_URL` comes from `postgres-app`, which CloudNativePG creates. Every variable is described in
`apps/api/.env.example`.

## Backups and restore

CloudNativePG archives every WAL segment and takes a base backup daily at 02:30 UTC (plus one right after the
cluster is created) into the `backups` ObjectStore: `s3://toasthub-backups/postgres/`, kept 14 days (SPEC §10).
Check them:

```sh
kubectl -n toasthub get backups                    # one per day, phase "completed"
kubectl -n toasthub get cluster postgres -o jsonpath='{.status.conditions}'   # ContinuousArchiving = True
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

**Replace the live database** (data loss up to the target time; check the steps above worked first):

1. Stop writers: `kubectl -n toasthub scale deployment api worker --replicas=0`.
2. Delete the cluster (this deletes its volume): `kubectl -n toasthub delete cluster postgres`.
3. Apply a `Cluster` named `postgres` like the test one above, plus the `plugins` section from
   `infra/k8s/base/postgres.yaml` with one more parameter, `serverName: postgres-r1` (the next free name). A new
   cluster can't archive into the old `postgres/` folder, which isn't empty.
4. Wait until it is healthy, then set the same `serverName: postgres-r1` under `plugins` in
   `infra/k8s/base/postgres.yaml`, commit, and run `deploy.sh`. The operator ignores the `bootstrap` section of
   an existing cluster, so going back to `initdb` there changes nothing. The pods scale back up with the deploy.

Same name, same `postgres-app` Secret and host, so nothing else in the app changes.

## Troubleshooting

| Symptom                                      | Look at                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `deploy.sh` waits for migrations a long time | `kubectl -n toasthub get cluster,pods`: the database isn't up yet, or `postgres-app` doesn't exist yet |
| Pods `ImagePullBackOff`                      | GHCR package still private, or no images for that SHA (CI not green)                                   |
| Pods `CreateContainerConfigError`            | A Secret is missing: unsealed (wrong cluster key?) or `postgres-app` not made yet                      |
| No certificate / browser warning             | `kubectl -n toasthub get certificate,challenges`; DNS must point at the server, port 80 open           |
| Photos don't load                            | Browser console: CSP `img-src` must equal `S3_ENDPOINT`; presigned URLs must use that host             |
| Backups not completing                       | `kubectl -n toasthub logs postgres-1 -c plugin-barman-cloud`; R2 token and bucket name                 |
| Logs                                         | `kubectl -n toasthub logs deploy/api` (JSON, one line per request with its request ID)                 |
