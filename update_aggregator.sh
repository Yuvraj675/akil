#!/bin/bash
set -e
docker build -t akil-aggregator:latest -f Dockerfile.aggregator .
kind load docker-image akil-aggregator:latest --name akil-demo
kubectl rollout restart deployment akil-aggregator -n akil-system
kubectl rollout status deployment akil-aggregator -n akil-system
pkill -f "kubectl port-forward svc/akil-aggregator" || true
nohup kubectl port-forward svc/akil-aggregator -n akil-system 8080:8080 > pf.log 2>&1 &
