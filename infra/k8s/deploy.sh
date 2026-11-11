#!/usr/bin/env bash
# Deploys an overlay to the current kubectl context (SPEC §12 D60):
#   1. everything except the api, worker and web Deployments (config, secrets, database, the migration Job),
#   2. waits for the migrations to finish,
#   3. then the Deployments, and waits for their rollout.
# So new pods never start on an old schema, and a failed migration stops the deploy with the old pods serving.
#
# Usage: infra/k8s/deploy.sh <dev|prod> [image tag]
#   The tag (the commit SHA the CI images are tagged with) replaces the overlay's image tags; prod needs one.
set -euo pipefail

overlay=${1:?usage: deploy.sh <dev|prod> [image tag]}
tag=${2:-}
namespace=toasthub
dir="$(cd "$(dirname "$0")" && pwd)/overlays/$overlay"

if [[ ! -d $dir ]]; then
  echo "No overlay at $dir" >&2
  exit 1
fi
if [[ $overlay == prod && -z $tag ]]; then
  echo "prod needs an image tag (the commit SHA of the images to deploy)" >&2
  exit 1
fi
if grep -rq REPLACE_ME "$dir"; then
  echo "Fill in every REPLACE_ME in $dir first (docs/DEPLOY.md):" >&2
  grep -rn REPLACE_ME "$dir" >&2
  exit 1
fi

manifest=$(mktemp)
trap 'rm -f "$manifest"' EXIT
kubectl kustomize "$dir" > "$manifest"
if [[ -n $tag ]]; then
  # `image: <registry/>toasthub-api[:old]` → `…:<tag>`, for both images.
  sed -E -i "s#^( *image: ([^ ]*/)?toasthub-(api|web))(:[^ ]*)?\$#\1:${tag}#" "$manifest"
fi

echo "Deploying overlay '$overlay' to context '$(kubectl config current-context)'"

# A Job's pod template is immutable, and a finished Job never runs again: start from a fresh one.
kubectl -n "$namespace" delete job migrate --ignore-not-found --wait=true 2> /dev/null || true
kubectl apply -f "$manifest" -l 'app.kubernetes.io/component notin (api,worker,web)'

echo "Waiting for the migration Job (a first deploy also waits for the database)..."
deadline=$((SECONDS + 900))
while true; do
  conditions=$(kubectl -n "$namespace" get job migrate \
    -o jsonpath='{range .status.conditions[?(@.status=="True")]}{.type}{" "}{end}')
  if [[ $conditions == *Complete* ]]; then
    break
  fi
  if [[ $conditions == *Failed* || $SECONDS -gt $deadline ]]; then
    echo "Migrations failed; the running version keeps serving. Last log lines:" >&2
    kubectl -n "$namespace" logs job/migrate --tail=50 >&2 || true
    exit 1
  fi
  sleep 5
done
echo "Migrations applied."

kubectl apply -f "$manifest"
for deployment in api worker web; do
  kubectl -n "$namespace" rollout status "deployment/$deployment" --timeout=5m
done
echo "Deployed."
