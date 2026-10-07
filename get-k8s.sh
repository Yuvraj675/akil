#!/bin/bash
set -e
VERSION="v0.31.0"
K8S_VERSION="v1.31.0"

go mod edit -require k8s.io/kubernetes@$K8S_VERSION
go mod edit -require k8s.io/api@$VERSION
go mod edit -require k8s.io/apimachinery@$VERSION
go mod edit -require k8s.io/client-go@$VERSION

# Fetch all k8s.io staging modules to replace
MODS=$(curl -sS https://raw.githubusercontent.com/kubernetes/kubernetes/${K8S_VERSION}/go.mod | grep "k8s.io/" | grep "=>" | awk '{print $1}')

for mod in $MODS; do
    go mod edit -replace ${mod}=${mod}@${VERSION}
done

go get k8s.io/kubernetes@${K8S_VERSION}
go mod tidy
