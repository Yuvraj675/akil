# AKIL — Makefile
# Build, test, and deploy targets for the Adaptive Kernel Intelligence Layer.

# Go settings
GOCMD      := go
GOBUILD    := $(GOCMD) build
GOTEST     := $(GOCMD) test
GOVET      := $(GOCMD) vet
GOMOD      := $(GOCMD) mod
GOGENERATE := $(GOCMD) generate
GOLINT     := golangci-lint

# Binary output directory
BIN_DIR    := bin
MODULE     := github.com/Yuvraj675/akil

# Container settings
REGISTRY   ?= ghcr.io/yuvraj675/akil
TAG        ?= latest

# Proto settings
PROTO_DIR  := pkg/proto

# Binaries
COLLECTOR_BIN       := $(BIN_DIR)/akil-collector
AGGREGATOR_BIN      := $(BIN_DIR)/akil-aggregator
SCHEDULER_PLUGIN_BIN := $(BIN_DIR)/akil-scheduler

.PHONY: all build clean test vet lint proto generate image kind-up kind-down deploy help

## Default target
all: build

## help: Show this help message
help:
	@echo "AKIL — Build Targets"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/^## /  /'

## build: Build all binaries
build: build-collector build-aggregator
	@echo "Build complete."

## build-collector: Build the collector DaemonSet binary
build-collector:
	@mkdir -p $(BIN_DIR)
	$(GOBUILD) -o $(COLLECTOR_BIN) ./cmd/collector/

## build-aggregator: Build the aggregator Deployment binary
build-aggregator:
	@mkdir -p $(BIN_DIR)
	$(GOBUILD) -o $(AGGREGATOR_BIN) ./cmd/aggregator/

## build-scheduler: Build the custom kube-scheduler with AKIL plugin (requires k8s dependencies)
build-scheduler:
	@mkdir -p $(BIN_DIR)
	$(GOBUILD) -o $(SCHEDULER_PLUGIN_BIN) ./cmd/scheduler-plugin/

## proto: Generate Go code from protobuf definitions
proto:
	protoc \
		--go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		$(PROTO_DIR)/akil.proto

## generate: Run all Go generate directives (including bpf2go)
generate:
	$(GOGENERATE) ./...

## test: Run all tests
test:
	$(GOTEST) -v -race ./...

## test-unit: Run unit tests only (skip integration)
test-unit:
	$(GOTEST) -v -race -short ./...

## vet: Run go vet
vet:
	$(GOVET) ./...

## lint: Run golangci-lint
lint:
	$(GOLINT) run ./...

## tidy: Tidy Go modules
tidy:
	$(GOMOD) tidy

## clean: Remove build artifacts
clean:
	rm -rf $(BIN_DIR)
	$(GOCMD) clean -cache

## image: Build Docker images for all components
image: image-collector image-aggregator

## image-collector: Build collector Docker image
image-collector:
	docker build -t $(REGISTRY)/collector:$(TAG) -f deploy/docker/Dockerfile.collector .

## image-aggregator: Build aggregator Docker image
image-aggregator:
	docker build -t $(REGISTRY)/aggregator:$(TAG) -f deploy/docker/Dockerfile.aggregator .

## kind-up: Create a local kind cluster for development
kind-up:
	kind create cluster --name akil --config hack/kind-config.yaml
	@echo "kind cluster 'akil' created"

## kind-down: Delete the local kind cluster
kind-down:
	kind delete cluster --name akil

## deploy: Deploy AKIL to the current Kubernetes cluster via Helm
deploy:
	helm upgrade --install akil deploy/helm/ \
		--namespace akil-system \
		--create-namespace

## undeploy: Remove AKIL from the cluster
undeploy:
	helm uninstall akil --namespace akil-system

## benchmark: Run synthetic benchmark workloads
benchmark:
	kubectl apply -f benchmarks/

## dev: Run aggregator locally for development
dev-aggregator:
	$(GOBUILD) -o $(AGGREGATOR_BIN) ./cmd/aggregator/ && \
	$(AGGREGATOR_BIN) --listen-addr=:50051
