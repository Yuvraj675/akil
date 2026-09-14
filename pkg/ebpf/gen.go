// Package ebpf provides eBPF program loading and management for AKIL.
//
// At build time, bpf2go compiles akil.c into eBPF bytecode and generates
// Go bindings (akil_bpfel.go / akil_bpfeb.go). This package wraps those
// generated types with a higher-level Loader API.
//
// NOTE: The bpf2go generate directive requires:
//   - clang 15+
//   - A vmlinux.h BTF header (generate with: bpftool btf dump file /sys/kernel/btf/vmlinux format c > vmlinux.h)
//
// In environments where eBPF compilation is not available (CI without kernel headers),
// the generated .go files are committed to the repo so the package still compiles.
package ebpf

// To regenerate eBPF Go bindings, run:
//   go generate ./pkg/ebpf/
//
// This requires clang and bpftool in PATH.
// The generated files are committed to the repo.

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang -cflags "-O2 -g -Wall -Werror" -target amd64 akil akil.c -- -I. -I/usr/include
