#!/usr/bin/env bash
# Installs the cluster-wide pieces the app's manifests need, once per cluster (dev and prod alike):
# cert-manager (TLS, and the Barman Cloud plugin's own certificates), CloudNativePG + the Barman Cloud plugin
# (Postgres and its backups) and the Sealed Secrets controller. Safe to run again, also to upgrade: bump a
# version below, then rerun. Uses the current kubectl context, so check it first (docs/DEPLOY.md).
set -euo pipefail

CERT_MANAGER_VERSION=v1.21.3
CNPG_VERSION=1.30.1
BARMAN_PLUGIN_VERSION=v0.15.1
SEALED_SECRETS_VERSION=v0.41.2

echo "Installing into context: $(kubectl config current-context)"

kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"
kubectl -n cert-manager rollout status deployment/cert-manager-webhook --timeout=5m

# Server-side: the CNPG CRDs are too big for the last-applied annotation of a client-side apply.
kubectl apply --server-side -f "https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v${CNPG_VERSION}/cnpg-${CNPG_VERSION}.yaml"
kubectl -n cnpg-system rollout status deployment/cnpg-controller-manager --timeout=5m

kubectl apply -f "https://github.com/cloudnative-pg/plugin-barman-cloud/releases/download/${BARMAN_PLUGIN_VERSION}/manifest.yaml"
kubectl -n cnpg-system rollout status deployment/barman-cloud --timeout=5m

kubectl apply -f "https://github.com/bitnami/sealed-secrets/releases/download/${SEALED_SECRETS_VERSION}/controller.yaml"
kubectl -n kube-system rollout status deployment/sealed-secrets-controller --timeout=5m

echo "Operators ready."
