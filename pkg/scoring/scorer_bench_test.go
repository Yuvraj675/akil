package scoring

import (
	"fmt"
	"testing"

	"github.com/Yuvraj675/akil/pkg/profile"
)

// BenchmarkScore measures the pure scoring math for a node with m co-located workloads.
func BenchmarkScore(b *testing.B) {
	s := NewScorer(DefaultScorerConfig())
	candidate := profile.RuntimeProfile{
		CacheMissRate: 120000, LockContentionRatio: 0.04, PageFaultRate: 350,
		ContextSwitchRate: 2500, Confidence: profile.ConfidenceHigh,
	}
	for _, m := range []int{1, 5, 10, 20, 50, 100} {
		colocated := make([]profile.RuntimeProfile, m)
		for i := range colocated {
			colocated[i] = profile.RuntimeProfile{
				CacheMissRate: 900000, LockContentionRatio: 0.08, PageFaultRate: 1200,
				ContextSwitchRate: 4000, Confidence: profile.ConfidenceHigh,
			}
		}
		b.Run(fmt.Sprintf("colocated=%d", m), func(b *testing.B) {
			for i := 0; i < b.N; i++ {
				s.Score(candidate, colocated)
			}
		})
	}
}
