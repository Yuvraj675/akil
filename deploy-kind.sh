#!/bin/bash
set -e

echo "======================================"
echo "AKIL Phase 2: Kind Cluster Integration"
echo "======================================"

# 1. Build images
echo "[1/4] Building Docker Images..."
docker build -t akil-aggregator:latest -f Dockerfile.aggregator .
docker build -t akil-collector:latest -f Dockerfile.collector .

# Note: Scheduler plugin usually requires sigs.k8s.io/scheduler-plugins boilerplate to compile correctly. 
# We'll skip building the scheduler binary here for the sake of the demo cluster, but the code is in cmd/scheduler-plugin.
# docker build -t akil-scheduler:latest -f Dockerfile.scheduler .

# 2. Create Kind Cluster
echo "[2/4] Creating Kind Cluster..."
kind create cluster --name akil-demo || true

# 3. Load images into Kind
echo "[3/4] Loading Images into Kind..."
kind load docker-image akil-aggregator:latest --name akil-demo
kind load docker-image akil-collector:latest --name akil-demo

# 4. Apply Manifests
echo "[4/4] Deploying AKIL to Cluster..."
kubectl apply -f deploy/kubernetes/akil-system.yaml

echo ""
echo "AKIL System successfully deployed to Kind cluster 'akil-demo'!"
echo "Check status with: kubectl get pods -n akil-system"
