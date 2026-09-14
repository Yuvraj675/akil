// Package scoring implements the AKIL co-location penalty scoring algorithm.
// It computes a score in [0, 100] for placing a candidate workload on a node,
// based on the runtime profiles of the candidate and existing workloads.
package scoring

import (
	"math"

	"github.com/Yuvraj675/akil/pkg/profile"
)

// DefaultWeights are the default scoring weights per signal type.
var DefaultWeights = Weights{
	Cache:     35,
	Lock:      30,
	PageFault: 20,
	CtxSwitch: 15,
}

// Weights configures the relative importance of each signal type in scoring.
type Weights struct {
	Cache     float64 // cache thrashing penalty weight
	Lock      float64 // lock contention penalty weight
	PageFault float64 // page fault penalty weight
	CtxSwitch float64 // context switch penalty weight
}

// Scorer computes co-location penalty scores for the AKIL scheduler plugin.
type Scorer struct {
	weights Weights

	// maxRates are the normalization denominators for rate-based penalties.
	// These should be calibrated based on cluster-wide observations.
	maxCacheMissRate    float64
	maxPageFaultRate    float64
	maxCtxSwitchRate    float64
}

// ScorerConfig configures the Scorer.
type ScorerConfig struct {
	Weights Weights

	// Max rates for normalization (cluster-wide calibration).
	// If zero, defaults are used.
	MaxCacheMissRate float64
	MaxPageFaultRate float64
	MaxCtxSwitchRate float64
}

// DefaultScorerConfig returns a config with sensible defaults.
func DefaultScorerConfig() ScorerConfig {
	return ScorerConfig{
		Weights:          DefaultWeights,
		MaxCacheMissRate: 1e6,  // 1M misses/sec
		MaxPageFaultRate: 1e4,  // 10K faults/sec
		MaxCtxSwitchRate: 1e4,  // 10K switches/sec
	}
}

// NewScorer creates a Scorer with the given configuration.
func NewScorer(cfg ScorerConfig) *Scorer {
	if cfg.MaxCacheMissRate <= 0 {
		cfg.MaxCacheMissRate = 1e6
	}
	if cfg.MaxPageFaultRate <= 0 {
		cfg.MaxPageFaultRate = 1e4
	}
	if cfg.MaxCtxSwitchRate <= 0 {
		cfg.MaxCtxSwitchRate = 1e4
	}

	return &Scorer{
		weights:          cfg.Weights,
		maxCacheMissRate: cfg.MaxCacheMissRate,
		maxPageFaultRate: cfg.MaxPageFaultRate,
		maxCtxSwitchRate: cfg.MaxCtxSwitchRate,
	}
}

// NeutralScore is returned when the plugin cannot or should not influence scoring.
const NeutralScore = 50

// ScoreResult contains the computed score and breakdown for debugging.
type ScoreResult struct {
	// Score is the final score in [0, 100]. Higher is better.
	Score int64

	// Penalties is the breakdown of penalties by signal type (for observability).
	CachePenalty     float64
	LockPenalty      float64
	PageFaultPenalty float64
	CtxSwitchPenalty float64
	TotalPenalty     float64

	// Reason describes why the score was computed this way.
	Reason string
}

// Score computes the co-location score for placing a candidate workload on a node.
//
// Parameters:
//   - candidate: the runtime profile of the workload being scheduled
//   - colocated: the runtime profiles of all workloads already running on the candidate node
//
// Returns a ScoreResult with score in [0, 100], or NeutralScore if insufficient data.
func (s *Scorer) Score(candidate profile.RuntimeProfile, colocated []profile.RuntimeProfile) ScoreResult {
	// If no candidate profile or unknown confidence, return neutral
	if candidate.Confidence == profile.ConfidenceUnknown {
		return ScoreResult{
			Score:  NeutralScore,
			Reason: "no profile available for candidate workload",
		}
	}

	// If no co-located workloads, perfect score — empty node
	if len(colocated) == 0 {
		return ScoreResult{
			Score:  100,
			Reason: "no co-located workloads on node",
		}
	}

	var totalCachePenalty, totalLockPenalty, totalPFPenalty, totalCSPenalty float64

	for _, p := range colocated {
		if p.Confidence == profile.ConfidenceUnknown {
			continue // skip workloads with no profile data
		}

		// Cache penalty: min of the two rates (captures destructive interference)
		cachePenalty := math.Min(candidate.CacheMissRate, p.CacheMissRate) /
			s.maxCacheMissRate * s.weights.Cache

		// Lock penalty: sum of ratios (both contribute to contention pressure)
		lockPenalty := (candidate.LockContentionRatio + p.LockContentionRatio) *
			s.weights.Lock

		// Page fault penalty: sum normalized
		pfPenalty := (candidate.PageFaultRate + p.PageFaultRate) /
			s.maxPageFaultRate * s.weights.PageFault

		// Context switch penalty: sum normalized
		csPenalty := (candidate.ContextSwitchRate + p.ContextSwitchRate) /
			s.maxCtxSwitchRate * s.weights.CtxSwitch

		totalCachePenalty += cachePenalty
		totalLockPenalty += lockPenalty
		totalPFPenalty += pfPenalty
		totalCSPenalty += csPenalty
	}

	totalPenalty := totalCachePenalty + totalLockPenalty + totalPFPenalty + totalCSPenalty

	// Apply confidence dampening
	totalPenalty *= confidenceDampeningFactor(candidate.Confidence)

	// Compute final score
	score := 100.0 - totalPenalty
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}

	return ScoreResult{
		Score:            int64(math.Round(score)),
		CachePenalty:     totalCachePenalty,
		LockPenalty:      totalLockPenalty,
		PageFaultPenalty: totalPFPenalty,
		CtxSwitchPenalty: totalCSPenalty,
		TotalPenalty:     totalPenalty,
		Reason:           "co-location penalty scoring applied",
	}
}

// confidenceDampeningFactor returns the multiplier for penalty based on confidence.
// Lower confidence = lower penalty impact (less trust in the data).
func confidenceDampeningFactor(c profile.Confidence) float64 {
	switch c {
	case profile.ConfidenceLow:
		return 0.25
	case profile.ConfidenceMedium:
		return 0.75
	case profile.ConfidenceHigh:
		return 1.0
	default:
		return 0.0 // unknown confidence → no penalty
	}
}
