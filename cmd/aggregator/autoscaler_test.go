package main

import (
	"testing"
	"time"

	"github.com/Yuvraj675/akil/pkg/profile"
)

func TestDecideScalesUpWhileHotAndDownOnceDrained(t *testing.T) {
	store := profile.NewStore(2, 50*time.Millisecond)
	noisy := "default/Deployment/cache-stress"
	for i := 0; i < 5; i++ {
		store.GetOrCreate(noisy).RecordBulk(1200, 900_000, 4000, 80_000_000, "node-1")
	}

	if n, _ := decide(store, []string{noisy}, 2); n != 3 {
		t.Fatalf("hot workload: want 3 replicas, got %d", n)
	}
	if n, _ := decide(store, []string{noisy}, maxReplicas); n != maxReplicas {
		t.Fatalf("should cap at %d, got %d", maxReplicas, n)
	}

	time.Sleep(200 * time.Millisecond) // the whole window expires: the profile drains
	if n, _ := decide(store, []string{noisy}, 3); n != 2 {
		t.Fatalf("drained workload: want 2 replicas, got %d", n)
	}
	if n, _ := decide(store, []string{noisy}, 1); n != 1 {
		t.Fatalf("should not go below 1, got %d", n)
	}
}
