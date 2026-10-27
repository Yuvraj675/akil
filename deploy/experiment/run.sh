#!/usr/bin/env bash
# Live-cluster experiment: measures real request latency of webbench under each
# scheduler, next to real stress-ng neighbours. Run setup.sh once first.
#
#   deploy/experiment/run.sh [trials] [seconds]
#
# Phase 1 pins webbench to each worker (and to an idle worker) to measure what each
# neighbour costs. Phase 2 lets default-scheduler and akil-scheduler place it, then
# measures the latency of whichever node they chose.
# Output: evidence/raw_data/live_cluster_runs.csv
set -euo pipefail
cd "$(dirname "$0")/../.."
TRIALS=${1:-10}
SECS=${2:-30}
RPS=${RPS:-40}
K="kubectl --context kind-akil-exp"
OUT=evidence/raw_data/live_cluster_runs.csv
CP=akil-exp-control-plane

declare -A NEIGHBOUR=([akil-exp-worker]=cache-stress [akil-exp-worker2]=lock-stress [akil-exp-worker3]=batch-worker)

# webbench <scheduler> [nodeName]
webbench() {
  local pin=""
  [ -n "${2:-}" ] && pin="nodeName: $2"
  $K delete deploy webbench --ignore-not-found --wait=true >/dev/null
  $K wait --for=delete pod -l app=webbench --timeout=60s >/dev/null 2>&1 || true
  cat <<EOF | $K apply -f - >/dev/null
apiVersion: apps/v1
kind: Deployment
metadata: {name: webbench}
spec:
  replicas: 1
  selector: {matchLabels: {app: webbench}}
  template:
    metadata: {labels: {app: webbench}}
    spec:
      schedulerName: $1
      $pin
      containers:
        - name: web
          image: akil-webbench:exp
          args: ["-working-set-mb", "${WS_MB:-1}", "-reads", "${READS:-200000}"]
          imagePullPolicy: Never
          readinessProbe: {httpGet: {path: /healthz, port: 8080}, periodSeconds: 1}
          resources: {requests: {cpu: 500m, memory: 64Mi}, limits: {memory: 128Mi}}
EOF
  $K rollout status deploy/webbench --timeout=120s >/dev/null
  $K get pod -l app=webbench -o jsonpath='{.items[0].spec.nodeName}'
}

# Runs the load generator on the control plane and prints its JSON result.
measure() {
  $K delete pod loadgen --ignore-not-found --wait=true >/dev/null
  $K run loadgen --image=akil-loadgen:exp --image-pull-policy=Never --restart=Never \
    --overrides="{\"spec\":{\"nodeName\":\"$CP\"}}" -- \
    -url http://webbench:8080/ -rps "$RPS" -duration "${SECS}s" -warmup 5s >/dev/null
  $K wait --for=jsonpath='{.status.phase}'=Succeeded pod/loadgen --timeout=$((SECS + 120))s >/dev/null
  $K logs loadgen | tail -1
}

record() { # phase scheduler node json [fail_open]
  local n=${NEIGHBOUR[$3]:-none}
  python3 -c 'import json,sys; d=json.loads(sys.argv[5]); print(",".join([sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]]+[str(d[k]) for k in ("requests","errors","p50_ms","p90_ms","p99_ms","p999_ms")]+[sys.argv[6]]))' \
    "$1" "$2" "$3" "$n" "$4" "${5:-0}" | tee -a "$OUT"
}

[ "${SKIP_PINNED:-0}" = 1 ] || echo "phase,scheduler,node,neighbour,requests,errors,p50_ms,p90_ms,p99_ms,p999_ms,fail_open" > "$OUT"

# The autoscaler would replicate the noise and webbench mid-run.
$K -n akil-system port-forward svc/akil-aggregator 18080:8080 >/dev/null 2>&1 &
PF=$!
trap 'kill $PF 2>/dev/null; $K delete deploy webbench --ignore-not-found >/dev/null; $K delete pod loadgen --ignore-not-found >/dev/null' EXIT
sleep 3
curl -sf localhost:18080/api/autoscale/disable >/dev/null
$K scale deploy cache-stress lock-stress batch-worker --replicas=1 >/dev/null

if [ "${SKIP_PINNED:-0}" != 1 ]; then # SKIP_PINNED=1 appends phase 2 to an existing file
echo "== Phase 1: pinned placements =="
for node in akil-exp-worker akil-exp-worker2 akil-exp-worker3; do
  for i in 1 2 3; do record pinned pinned "$node" "$(webbench default-scheduler $node >/dev/null; measure)"; done
done
# Idle node: move cache-stress away so worker has no neighbour.
$K scale deploy cache-stress --replicas=0 >/dev/null
$K wait --for=delete pod -l app=cache-stress --timeout=60s >/dev/null 2>&1 || true
NEIGHBOUR[akil-exp-worker]=none
for i in 1 2 3; do record pinned isolated akil-exp-worker "$(webbench default-scheduler akil-exp-worker >/dev/null; measure)"; done
NEIGHBOUR[akil-exp-worker]=cache-stress
$K scale deploy cache-stress --replicas=1 >/dev/null
$K rollout status deploy/cache-stress --timeout=60s >/dev/null
sleep 20 # let the aggregator see cache-stress again before AKIL scores against it
fi

echo "== Phase 2: scheduler placements ($TRIALS trials each) =="
for i in $(seq "$TRIALS"); do
  for sched in default-scheduler akil-scheduler; do
    since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    node=$(webbench $sched)
    # Score() calls that fell back to neutral (aggregator slower than 5 ms)
    fo=0
    [ $sched = akil-scheduler ] && fo=$($K -n kube-system logs deploy/akil-scheduler --since-time="$since" | grep -c 'returning neutral' || true)
    record placed "$sched" "$node" "$(measure)" "$fo"
  done
done
echo "Wrote $OUT"
