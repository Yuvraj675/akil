#!/usr/bin/env bash
# Starts the AKIL cluster and the demo frontend.
#
# The kind node containers are set to never auto-start, so nothing runs at boot;
# this script starts them on demand and stop.sh stops them again.
#
#   ./start.sh            start cluster + port-forward + frontend
#   ./start.sh --no-ui    start cluster + port-forward only
set -euo pipefail
cd "$(dirname "$0")"

CLUSTER=akil-exp
CTX=kind-$CLUSTER
K="kubectl --context $CTX"
# Per-node memory caps (GiB) so the cluster can never take the whole machine.
CP_MEM=2g
WORKER_MEM=1536m
MIN_FREE_MB=4500

say() { printf '\033[0;34m==>\033[0m %s\n' "$*"; }

# 1. kube-proxy and kubelet need more inotify instances than Linux allows by default;
#    without this they crash with "too many open files" after every reboot.
if [ "$(sysctl -n fs.inotify.max_user_instances)" -lt 512 ]; then
  say "Raising inotify limits (needs sudo)"
  sudo sysctl -q -w fs.inotify.max_user_instances=512 fs.inotify.max_user_watches=524288
fi

# 2. Refuse to start if the machine is already short on memory.
avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
running=$(docker ps -q --filter "label=io.x-k8s.kind.cluster=$CLUSTER")
if [ -z "$running" ] && [ "$avail" -lt "$MIN_FREE_MB" ]; then
  echo "Only ${avail} MB of RAM available; the cluster needs about ${MIN_FREE_MB} MB. Close something and retry." >&2
  exit 1
fi

# 3. Start (or create) the cluster.
NODES=$(docker ps -a --filter "label=io.x-k8s.kind.cluster=$CLUSTER" --format '{{.Names}}')
if [ -z "$NODES" ]; then
  say "Cluster $CLUSTER not found; creating it (first run takes a few minutes)"
  deploy/experiment/setup.sh
  NODES=$(docker ps -a --filter "label=io.x-k8s.kind.cluster=$CLUSTER" --format '{{.Names}}')
fi
for n in $NODES; do
  mem=$WORKER_MEM; [[ $n == *control-plane ]] && mem=$CP_MEM
  docker update --restart=no --memory "$mem" --memory-swap "$mem" "$n" >/dev/null
done
say "Starting nodes: $(echo $NODES)"
docker start $NODES >/dev/null

# 4. Wait for the cluster and AKIL to come up.
say "Waiting for the API server"
until $K get --raw /readyz >/dev/null 2>&1; do sleep 2; done
$K wait --for=condition=Ready nodes --all --timeout=180s >/dev/null
# Pods that crash-looped while the network was down can sit in back-off for minutes.
$K delete pods -A --field-selector=status.phase!=Running --wait=false >/dev/null 2>&1 || true
$K -n akil-system rollout status deploy/akil-aggregator --timeout=180s
$K -n akil-system rollout status ds/akil-collector --timeout=180s
$K -n kube-system rollout status deploy/akil-scheduler --timeout=180s
# The demo's autoscaler panel scales this deployment (the only one labelled for it).
$K apply -f deploy/kubernetes/demo-workload.yaml >/dev/null
# The noise pods are pinned; keep each at one replica.
$K scale deploy cache-stress lock-stress batch-worker --replicas=1 >/dev/null 2>&1 || true

# 5. Expose the aggregator API on localhost:8080.
pkill -f "port-forward svc/akil-aggregator" 2>/dev/null || true
# A port-forward dies when the aggregator pod restarts, so keep re-opening it.
(while true; do $K -n akil-system port-forward svc/akil-aggregator 8080:8080 >/dev/null 2>&1; sleep 1; done) &
PF=$!
trap 'kill $PF 2>/dev/null; pkill -f "port-forward svc/akil-aggregator 8080" 2>/dev/null' EXIT
say "Aggregator API: http://localhost:8080/api/profiles"

if [ "${1:-}" = "--no-ui" ]; then
  say "Press Ctrl+C to stop the port-forward (the cluster keeps running; ./stop.sh stops it)."
  wait $PF
  exit
fi

# 6. Frontend.
cd frontend
[ -d node_modules ] || npm install
say "Frontend: http://localhost:5173  (Ctrl+C stops the UI; ./stop.sh stops the cluster)"
npm run dev -- --port 5173
