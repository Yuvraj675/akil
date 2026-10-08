#!/bin/bash
kubectl rollout status deployment/akil-aggregator -n akil-system --timeout=120s
kubectl rollout restart daemonset akil-collector -n akil-system
kubectl rollout status daemonset/akil-collector -n akil-system --timeout=120s
pkill -f "kubectl port-forward svc/akil-aggregator" || true
kubectl port-forward svc/akil-aggregator -n akil-system 8080:8080 > /dev/null 2>&1 &
