#!/usr/bin/env bash
# Creates the experiment cluster and deploys AKIL plus the background neighbours.
# Run from the repo root: deploy/experiment/setup.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
EXP=deploy/experiment
CLUSTER=akil-exp

echo "[1/6] Building static binaries"
export CGO_ENABLED=0
go build -o bin/akil-aggregator ./cmd/aggregator
go build -o bin/akil-collector ./cmd/collector
go build -o bin/webbench-server ./benchmarks/webbench/server
go build -o bin/webbench-loadgen ./benchmarks/webbench/loadgen
# kube-scheduler is large; limit parallelism so the build fits in memory
GOGC=50 GOMAXPROCS=2 go build -p 1 -o bin/akil-scheduler ./cmd/scheduler-plugin

echo "[2/6] Building images"
for pair in aggregator:akil-aggregator collector:akil-collector scheduler:akil-scheduler \
            webbench:webbench-server loadgen:webbench-loadgen; do
  name=${pair%%:*} bin=${pair#*:}
  docker build -q -f $EXP/Dockerfile --build-arg BIN=$bin -t akil-$name:exp . >/dev/null
done

echo "[3/6] Creating cluster"
kind get clusters | grep -qx $CLUSTER || kind create cluster --config $EXP/kind-config.yaml
kubectl config use-context kind-$CLUSTER >/dev/null

echo "[4/6] Pinning nodes to disjoint CPUs (1 P-core + 2 E-cores each)"
docker update --cpuset-cpus 6,7,14,15 $CLUSTER-control-plane >/dev/null
docker update --cpuset-cpus 0,1,8,9   $CLUSTER-worker  >/dev/null
docker update --cpuset-cpus 2,3,10,11 $CLUSTER-worker2 >/dev/null
docker update --cpuset-cpus 4,5,12,13 $CLUSTER-worker3 >/dev/null

echo "[5/6] Loading images"
kind load docker-image --name $CLUSTER akil-aggregator:exp akil-collector:exp akil-scheduler:exp \
  akil-webbench:exp akil-loadgen:exp polinux/stress-ng:latest

echo "[6/6] Deploying AKIL and neighbours"
sed -e 's/akil-aggregator:latest/akil-aggregator:exp/; s/akil-collector:latest/akil-collector:exp/' \
  deploy/kubernetes/akil-system.yaml | kubectl apply -f - >/dev/null
kubectl apply -f $EXP/akil-scheduler.yaml >/dev/null
# The aggregator is a control-plane component; on a worker it shares CPUs with the
# noise and misses the scheduler's 5 ms query budget.
kubectl -n akil-system patch deploy akil-aggregator --type merge -p '{"spec":{"template":{"spec":{"nodeSelector":{"node-role.kubernetes.io/control-plane":""},"tolerations":[{"key":"node-role.kubernetes.io/control-plane","effect":"NoSchedule"}]}}}}' >/dev/null
kubectl apply -f $EXP/workloads.yaml >/dev/null
for pair in cache-stress:$CLUSTER-worker lock-stress:$CLUSTER-worker2 batch-worker:$CLUSTER-worker3; do
  kubectl patch deployment ${pair%%:*} --type merge \
    -p "{\"spec\":{\"template\":{\"spec\":{\"nodeName\":\"${pair#*:}\"}}}}" >/dev/null
done
kubectl -n akil-system rollout status ds/akil-collector --timeout=180s
kubectl -n akil-system rollout status deploy/akil-aggregator --timeout=120s
kubectl -n kube-system rollout status deploy/akil-scheduler --timeout=120s
kubectl rollout status deploy/cache-stress deploy/lock-stress deploy/batch-worker --timeout=120s 2>/dev/null || true
echo "Ready."
