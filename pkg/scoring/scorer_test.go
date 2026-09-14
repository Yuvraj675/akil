package scoring

import (
	"testing"

	"github.com/Yuvraj675/akil/pkg/profile"
)

func TestScore_EmptyNode(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())
	candidate := profile.RuntimeProfile{
		WorkloadKey:         "default/Deployment/web",
		PageFaultRate:       100,
		CacheMissRate:       50000,
		LockContentionRatio: 0.05,
		ContextSwitchRate:   2000,
		Confidence:          profile.ConfidenceHigh,
	}

	result := s.Score(candidate, nil)
	if result.Score != 100 {
		t.Errorf("empty node should score 100, got %d", result.Score)
	}
	if result.Reason != "no co-located workloads on node" {
		t.Errorf("unexpected reason: %s", result.Reason)
	}
}

func TestScore_UnknownConfidence(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())
	candidate := profile.RuntimeProfile{
		WorkloadKey: "default/Deployment/new-app",
		Confidence:  profile.ConfidenceUnknown,
	}

	result := s.Score(candidate, []profile.RuntimeProfile{
		{WorkloadKey: "default/Deployment/existing", Confidence: profile.ConfidenceHigh},
	})

	if result.Score != NeutralScore {
		t.Errorf("unknown confidence should return neutral score (%d), got %d",
			NeutralScore, result.Score)
	}
}

func TestScore_HighContention(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())

	candidate := profile.RuntimeProfile{
		WorkloadKey:         "default/Deployment/cache-heavy-1",
		CacheMissRate:       800000, // very high
		LockContentionRatio: 0.3,
		PageFaultRate:       5000,
		ContextSwitchRate:   5000,
		Confidence:          profile.ConfidenceHigh,
	}

	colocated := []profile.RuntimeProfile{
		{
			WorkloadKey:         "default/Deployment/cache-heavy-2",
			CacheMissRate:       900000, // also very high
			LockContentionRatio: 0.4,
			PageFaultRate:       3000,
			ContextSwitchRate:   4000,
			Confidence:          profile.ConfidenceHigh,
		},
	}

	result := s.Score(candidate, colocated)

	// High contention on all dimensions should result in a low score
	if result.Score >= 70 {
		t.Errorf("high contention co-location should score below 70, got %d", result.Score)
	}
	if result.TotalPenalty <= 0 {
		t.Error("expected non-zero penalty")
	}
	t.Logf("Score: %d, Penalty: %.2f (cache=%.2f lock=%.2f pf=%.2f cs=%.2f)",
		result.Score, result.TotalPenalty,
		result.CachePenalty, result.LockPenalty,
		result.PageFaultPenalty, result.CtxSwitchPenalty)
}

func TestScore_LowConfidenceDampening(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())

	candidate := profile.RuntimeProfile{
		WorkloadKey:         "default/Deployment/new-app",
		CacheMissRate:       500000,
		LockContentionRatio: 0.2,
		PageFaultRate:       3000,
		ContextSwitchRate:   3000,
		SampleCount:         50, // low sample count
		Confidence:          profile.ConfidenceLow,
	}

	colocated := []profile.RuntimeProfile{
		{
			WorkloadKey:         "default/Deployment/existing",
			CacheMissRate:       500000,
			LockContentionRatio: 0.2,
			Confidence:          profile.ConfidenceHigh,
		},
	}

	resultLow := s.Score(candidate, colocated)

	// Same candidate but with HIGH confidence
	candidate.Confidence = profile.ConfidenceHigh
	resultHigh := s.Score(candidate, colocated)

	// Low confidence should result in a higher score (less penalty)
	if resultLow.Score <= resultHigh.Score {
		t.Errorf("low confidence score (%d) should be higher than high confidence score (%d) — dampening should reduce penalty",
			resultLow.Score, resultHigh.Score)
	}

	t.Logf("Low confidence: score=%d penalty=%.2f | High confidence: score=%d penalty=%.2f",
		resultLow.Score, resultLow.TotalPenalty, resultHigh.Score, resultHigh.TotalPenalty)
}

func TestScore_ComplementaryWorkloads(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())

	// CPU-bound, cache-friendly workload
	candidate := profile.RuntimeProfile{
		WorkloadKey:         "default/Deployment/cpu-bound",
		CacheMissRate:       1000,  // very low — cache friendly
		LockContentionRatio: 0.01, // minimal contention
		PageFaultRate:       100,
		ContextSwitchRate:   500,
		Confidence:          profile.ConfidenceHigh,
	}

	// I/O-bound workload (different resource pattern)
	colocated := []profile.RuntimeProfile{
		{
			WorkloadKey:         "default/Deployment/io-bound",
			CacheMissRate:       2000,  // also low
			LockContentionRatio: 0.02, // minimal
			PageFaultRate:       200,
			ContextSwitchRate:   8000, // high switches (I/O waiting)
			Confidence:          profile.ConfidenceHigh,
		},
	}

	result := s.Score(candidate, colocated)

	// Complementary workloads should score well (high score)
	if result.Score < 80 {
		t.Errorf("complementary workloads should score >= 80, got %d", result.Score)
	}

	t.Logf("Score: %d, Total penalty: %.2f", result.Score, result.TotalPenalty)
}

func TestScore_MultipleColocated(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())

	candidate := profile.RuntimeProfile{
		WorkloadKey:         "default/Deployment/new",
		CacheMissRate:       200000,
		LockContentionRatio: 0.1,
		PageFaultRate:       1000,
		ContextSwitchRate:   2000,
		Confidence:          profile.ConfidenceHigh,
	}

	// Multiple workloads already on the node
	colocated := []profile.RuntimeProfile{
		{WorkloadKey: "default/Deployment/app-1", CacheMissRate: 100000, LockContentionRatio: 0.05, Confidence: profile.ConfidenceHigh},
		{WorkloadKey: "default/Deployment/app-2", CacheMissRate: 150000, LockContentionRatio: 0.08, Confidence: profile.ConfidenceHigh},
		{WorkloadKey: "default/Deployment/app-3", CacheMissRate: 300000, LockContentionRatio: 0.15, Confidence: profile.ConfidenceHigh},
	}

	result := s.Score(candidate, colocated)

	// More co-located workloads = more penalty = lower score
	if result.Score >= 80 {
		t.Logf("Note: score %d with 3 co-located workloads — penalty may need calibration", result.Score)
	}

	t.Logf("Score: %d with %d co-located workloads, penalty=%.2f",
		result.Score, len(colocated), result.TotalPenalty)
}

func TestScore_Bounds(t *testing.T) {
	s := NewScorer(DefaultScorerConfig())

	// Extreme case: maximum contention everywhere
	candidate := profile.RuntimeProfile{
		WorkloadKey:         "default/Deployment/extreme",
		CacheMissRate:       1e7,
		LockContentionRatio: 1.0,
		PageFaultRate:       1e5,
		ContextSwitchRate:   1e5,
		Confidence:          profile.ConfidenceHigh,
	}

	colocated := make([]profile.RuntimeProfile, 10)
	for i := range colocated {
		colocated[i] = candidate
	}

	result := s.Score(candidate, colocated)

	if result.Score < 0 || result.Score > 100 {
		t.Errorf("score must be in [0, 100], got %d", result.Score)
	}
	t.Logf("Extreme case: score=%d (should be 0 or near 0)", result.Score)
}
