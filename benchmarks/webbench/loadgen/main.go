// Command webbench-loadgen sends requests at a fixed rate (open loop, so slow
// responses don't reduce the offered load) and prints latency percentiles as JSON.
package main

import (
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"sync"
	"time"
)

func main() {
	url := flag.String("url", "http://webbench:8080/", "target URL")
	rps := flag.Int("rps", 50, "requests per second")
	duration := flag.Duration("duration", 60*time.Second, "measurement duration")
	warmup := flag.Duration("warmup", 10*time.Second, "warm-up period excluded from results")
	flag.Parse()

	client := &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{MaxIdleConnsPerHost: 256}}
	var (
		mu        sync.Mutex
		latencies []float64
		errors    int
		wg        sync.WaitGroup
	)

	start := time.Now()
	end := start.Add(*warmup + *duration)
	tick := time.NewTicker(time.Second / time.Duration(*rps))
	defer tick.Stop()
	for now := range tick.C {
		if now.After(end) {
			break
		}
		measured := now.After(start.Add(*warmup))
		wg.Add(1)
		go func(sent time.Time) {
			defer wg.Done()
			resp, err := client.Get(*url)
			if err == nil {
				io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
			}
			ms := float64(time.Since(sent).Microseconds()) / 1000
			if !measured {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errors++
				return
			}
			latencies = append(latencies, ms)
		}(now)
	}
	wg.Wait()

	if len(latencies) == 0 {
		log.Fatal("no successful requests")
	}
	sort.Float64s(latencies)
	pct := func(q float64) float64 { return latencies[min(len(latencies)-1, int(float64(len(latencies))*q))] }
	json.NewEncoder(os.Stdout).Encode(map[string]any{
		"requests": len(latencies), "errors": errors,
		"p50_ms": pct(0.50), "p90_ms": pct(0.90), "p99_ms": pct(0.99), "p999_ms": pct(0.999),
	})
}
