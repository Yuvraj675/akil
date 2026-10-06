#!/usr/bin/env bash
set -e
set -o pipefail

# ANSI color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cleanup_on_error() {
    echo -e "${RED}[!] Script failed. Cleaning up kind cluster...${NC}"
    make kind-down || true
}

trap cleanup_on_error ERR

log() {
    echo -e "${GREEN}[*] $1${NC}"
}

step() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

error() {
    echo -e "${RED}[!] Error: $1${NC}"
    exit 1
}

step "1. Dependency Check"
for cmd in docker kind helm kubectl go make; do
    if ! command -v "$cmd" &> /dev/null; then
        error "'$cmd' is not installed. Please install it and make sure it is in your PATH."
    fi
done
log "All required dependencies (docker, kind, helm, kubectl, go, make) are installed."

step "2. Building Project Binaries"
log "Building collector and aggregator..."
make build || error "Failed to build project binaries."
log "Building CLI monitor..."
make build-cli || error "Failed to build CLI tool."
log "Binaries built successfully."

step "3. Building Docker Images"
log "Building Docker images for AKIL components..."
make image || error "Failed to build Docker images."
log "Images built successfully."

step "4. Setting up Kubernetes Cluster (kind)"
if kind get clusters | grep -q "^akil$"; then
    log "Kind cluster 'akil' already exists. Skipping creation."
else
    log "Creating kind cluster..."
    make kind-up || error "Failed to create kind cluster."
fi

step "5. Loading Images into Cluster"
log "Sideloading newly built images into the kind cluster..."
kind load docker-image ghcr.io/yuvraj675/akil/collector:latest --name akil || error "Failed to load collector image."
kind load docker-image ghcr.io/yuvraj675/akil/aggregator:latest --name akil || error "Failed to load aggregator image."
log "Images loaded."

step "6. Deploying AKIL"
log "Deploying AKIL via Helm to the 'akil-system' namespace..."
make deploy || error "Failed to deploy Helm chart."

sleep 5
log "Waiting for Aggregator to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=akil-aggregator -n akil-system --timeout=120s || error "Aggregator failed to start."
log "Waiting for Collector(s) to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=akil-collector -n akil-system --timeout=120s || log "Collectors might need more time or are running into BPF permission issues."

step "7. Deploying Synthetic Benchmarks"
log "Deploying cache-stress and lock-stress workloads..."
kubectl apply -f benchmarks/synthetic-workloads.yaml || error "Failed to deploy benchmarks."

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}🎉 AKIL has been successfully deployed and is running!${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "\nTo view the live telemetry interface, run these commands in separate terminal tabs:\n"
echo -e "Terminal 1 (Port-forward the gRPC server):"
echo -e "  ${BLUE}kubectl port-forward svc/akil-aggregator -n akil-system 50051:50051${NC}\n"
echo -e "Terminal 2 (Run the interactive CLI monitor):"
echo -e "  ${BLUE}./bin/akil-cli --workload \"default/Deployment/cache-stress\" --watch${NC}\n"
echo -e "Terminal 3 (Run the interactive Scheduler Plugin Simulator):"
echo -e "  ${BLUE}./bin/akil-scheduler --aggregator-addr=127.0.0.1:50051${NC}\n"
echo -e "When you are done demonstrating, run ${RED}./stop.sh${NC} to spin down all Docker containers."
