// Command webbench-server is the latency-sensitive workload for the cluster
// experiment. Each request does a fixed number of dependent random reads over a
// working set sized to sit in the LLC, so its latency rises when a neighbour
// evicts cache lines or competes for the CPU.
package main

import (
	"flag"
	"fmt"
	"log"
	"math/rand/v2"
	"net/http"
)

var (
	addr        = flag.String("addr", ":8080", "listen address")
	workingSet  = flag.Int("working-set-mb", 4, "working set size in MiB")
	readsPerReq = flag.Int("reads", 200000, "dependent random reads per request")
)

func main() {
	flag.Parse()

	// A random cyclic permutation: each element points to the next index to read,
	// so reads are dependent and the hardware prefetcher cannot hide misses.
	n := *workingSet << 20 / 8
	next := make([]uint64, n)
	perm := rand.Perm(n)
	for i := range perm {
		next[perm[i]] = uint64(perm[(i+1)%n])
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		idx := uint64(rand.IntN(n))
		for i := 0; i < *readsPerReq; i++ {
			idx = next[idx]
		}
		fmt.Fprintf(w, "%d\n", idx)
	})
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {})

	log.Printf("listening on %s, working set %d MiB, %d reads/request", *addr, *workingSet, *readsPerReq)
	log.Fatal(http.ListenAndServe(*addr, nil))
}
