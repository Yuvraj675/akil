#!/usr/bin/env bash
# Stops the AKIL cluster without deleting it, freeing its CPU and memory.
# ./start.sh brings it back. Use --destroy to delete the cluster entirely.
set -euo pipefail
CLUSTER=akil-exp

pkill -f "port-forward svc/akil-aggregator" 2>/dev/null || true

if [ "${1:-}" = "--destroy" ]; then
  kind delete cluster --name "$CLUSTER"
  exit
fi

NODES=$(docker ps --filter "label=io.x-k8s.kind.cluster=$CLUSTER" --format '{{.Names}}')
if [ -n "$NODES" ]; then
  docker stop $NODES >/dev/null
  echo "Stopped $CLUSTER. Run ./start.sh to start it again."
else
  echo "$CLUSTER is not running."
fi
