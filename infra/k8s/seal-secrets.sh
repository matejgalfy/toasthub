#!/usr/bin/env bash
# Encrypts the prod secrets for the cluster's Sealed Secrets controller (SPEC §12 D15) and writes
# infra/k8s/overlays/prod/sealed-secrets.yaml, which is safe to commit: only that cluster can decrypt it.
#
# Usage: infra/k8s/seal-secrets.sh <dir>
#   <dir> holds two env files, kept outside the repo (never commit them):
#     app.env     BETTER_AUTH_SECRET, SMTP_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
#     backup.env  ACCESS_KEY_ID, ACCESS_SECRET_KEY
#   kubeseal fetches the public key from the current kubectl context; to seal offline, set
#   SEALED_SECRETS_CERT to the certificate saved with `kubeseal --fetch-cert`.
set -euo pipefail

src=${1:?usage: seal-secrets.sh <dir with app.env and backup.env>}
namespace=toasthub
out="$(cd "$(dirname "$0")" && pwd)/overlays/prod/sealed-secrets.yaml"
cert_args=()
if [[ -n ${SEALED_SECRETS_CERT:-} ]]; then
  cert_args=(--cert "$SEALED_SECRETS_CERT")
fi

seal() {
  kubectl create secret generic "$1" --namespace "$namespace" --from-env-file "$2" \
    --dry-run=client -o yaml |
    kubeseal --format yaml --controller-namespace kube-system "${cert_args[@]}"
}

{
  echo '# Made by infra/k8s/seal-secrets.sh (docs/DEPLOY.md). Encrypted for the prod cluster only.'
  seal toasthub-app "$src/app.env"
  echo '---'
  seal toasthub-backup "$src/backup.env"
} > "$out.tmp"
mv "$out.tmp" "$out"
echo "Wrote $out"
