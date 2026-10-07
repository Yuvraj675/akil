#!/bin/bash
set -e

echo "Starting AKIL Simulation Environment..."

# 1. Ensure kind cluster exists and is running
if ! kind get clusters | grep -q "^akil-demo$"; then
    echo "Creating kind cluster and deploying..."
    ./deploy-kind.sh
else
    echo "Kind cluster 'akil-demo' already exists."
fi

# 2. Wait for deployments to be ready
echo "Waiting for aggregator to be ready..."
kubectl wait --for=condition=available --timeout=60s deployment/akil-aggregator -n akil-system

echo "Waiting for collector DaemonSet to be ready..."
kubectl rollout status daemonset/akil-collector -n akil-system --timeout=60s

# 3. Port-forward the aggregator API to localhost:8080
echo "Port-forwarding akil-aggregator to localhost:8080..."
# Kill any existing port-forward
pkill -f "kubectl port-forward svc/akil-aggregator" || true
kubectl port-forward svc/akil-aggregator -n akil-system 8080:8080 > /dev/null 2>&1 &
PF_PID=$!

# 4. Start the frontend
echo "Starting Frontend..."
cd frontend
# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    npm install
fi

# Trap to kill port-forward when the script exits
trap "echo 'Stopping port-forward...'; kill $PF_PID" EXIT

# Start vite dev server
npm run dev
