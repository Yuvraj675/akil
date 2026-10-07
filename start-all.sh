#!/bin/bash
set -e

echo "Starting AKIL Services and Frontend..."

# Kill any existing processes
cleanup() {
    echo "Shutting down..."
    kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. Start Aggregator (Go Backend)
echo "Building and starting Aggregator..."
go build -o bin/aggregator ./cmd/aggregator
./bin/aggregator -listen-addr ":50051" -http-addr ":8080" &
AGG_PID=$!

# Wait for aggregator to boot
sleep 2

# 2. Start Telemetry Simulator (Bash Loop)
echo "Starting Telemetry Load Generator..."
generate_load() {
    while true; do
        # Redis - high cache miss, high lock contention
        curl -s -X POST http://localhost:8080/api/simulate-events -H "Content-Type: application/json" \
            -d '{"workload_key": "data/StatefulSet/redis-cache", "node_name": "worker-node-01", "page_faults": 50, "cache_misses": 300, "lock_ns": 500000000, "ctx_switches": 1200}' > /dev/null

        # Nginx - low cache miss, high ctx switches
        curl -s -X POST http://localhost:8080/api/simulate-events -H "Content-Type: application/json" \
            -d '{"workload_key": "default/Deployment/nginx-frontend", "node_name": "worker-node-01", "page_faults": 20, "cache_misses": 10, "lock_ns": 1000000, "ctx_switches": 4000}' > /dev/null

        # Batch Processor - high page faults
        curl -s -X POST http://localhost:8080/api/simulate-events -H "Content-Type: application/json" \
            -d '{"workload_key": "jobs/Job/batch-processor", "node_name": "worker-node-02", "page_faults": 800, "cache_misses": 80, "lock_ns": 500000, "ctx_switches": 500}' > /dev/null
        
        sleep 1
    done
}
generate_load &

# 3. Start Frontend (Vite)
echo "Starting Vite Frontend..."
cd frontend
npm run dev -- --port 5173 &

echo "================================================="
echo "AKIL System Running!"
echo "Aggregator HTTP API: http://localhost:8080/api/profiles"
echo "Frontend Dashboard:  http://localhost:5173"
echo "Press Ctrl+C to stop all services."
echo "================================================="

wait
