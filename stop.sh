#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Tearing down AKIL Cluster ===${NC}"
make kind-down

echo -e "${GREEN}[*] Cluster destroyed. All Docker containers have been spun down and removed.${NC}"
