package main

import (
	"io/ioutil"
	"strings"
)

func main() {
	content, _ := ioutil.ReadFile("cmd/collector/main.go")
	s := string(content)

	// Add imports
	s = strings.Replace(s, "\"github.com/Yuvraj675/akil/pkg/ebpf\"", "\"encoding/binary\"\n\t\"fmt\"\n\n\t\"github.com/Yuvraj675/akil/pkg/cgroup\"\n\t\"github.com/Yuvraj675/akil/pkg/ebpf\"", 1)

	// Add resolver init
	initCode := `
	// Start cgroup resolver
	var resolver *cgroup.Resolver
	var errRes error
	resolver, errRes = cgroup.NewResolver(*nodeName)
	if errRes != nil {
		logger.Warn("failed to init cgroup resolver, using raw IDs", "error", errRes)
	} else {
		logger.Info("cgroup resolver started")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if resolver != nil {
		go resolver.Start(ctx)
	}
`
	s = strings.Replace(s, "ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)\n\tdefer cancel()", initCode, 1)

	// Replace mock assignment
	mockCode := `		// For simplicity, we just simulate workloads based on a hash of the event data length or just random
		workloadKeys := []string{"default/Deployment/nginx-frontend", "data/StatefulSet/redis-cache"}
		wk := workloadKeys[time.Now().UnixNano()%2]`

	realCode := `		cgroupID := binary.LittleEndian.Uint64(record.RawSample[8:16])
		
		wk := ""
		if resolver != nil {
			wk = resolver.Resolve(cgroupID)
		}
		if wk == "" {
			// fallback or ignore if not a k8s pod
			continue
		}`
	
	s = strings.Replace(s, mockCode, realCode, 1)

	ioutil.WriteFile("cmd/collector/main.go", []byte(s), 0644)
}
