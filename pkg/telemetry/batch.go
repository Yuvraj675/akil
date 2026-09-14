package telemetry

import (
	"log/slog"
	"sync"
	"time"

	pb "github.com/Yuvraj675/akil/pkg/proto"
)

// BatchAssembler accumulates TaggedEvents into TelemetryBatch protobuf messages.
// A batch is flushed when either maxEvents is reached or flushInterval elapses.
type BatchAssembler struct {
	mu sync.Mutex

	maxEvents     int
	flushInterval time.Duration
	nodeName      string
	logger        *slog.Logger

	current []*pb.TelemetryEvent
	output  chan *pb.TelemetryBatch
	done    chan struct{}
}

// BatchAssemblerConfig configures the batch assembler.
type BatchAssemblerConfig struct {
	// MaxEvents is the maximum number of events per batch.
	// Default: 1000
	MaxEvents int

	// FlushInterval is the maximum time between batch flushes.
	// Default: 1s
	FlushInterval time.Duration

	// NodeName is this node's name (included in each batch).
	NodeName string

	// OutputBufferSize is the channel buffer for completed batches.
	// Default: 16
	OutputBufferSize int

	Logger *slog.Logger
}

// DefaultBatchAssemblerConfig returns a config with sensible defaults.
func DefaultBatchAssemblerConfig() BatchAssemblerConfig {
	return BatchAssemblerConfig{
		MaxEvents:        1000,
		FlushInterval:    1 * time.Second,
		OutputBufferSize: 16,
		Logger:           slog.Default(),
	}
}

// NewBatchAssembler creates a new BatchAssembler.
func NewBatchAssembler(cfg BatchAssemblerConfig) *BatchAssembler {
	if cfg.MaxEvents == 0 {
		cfg.MaxEvents = 1000
	}
	if cfg.FlushInterval == 0 {
		cfg.FlushInterval = 1 * time.Second
	}
	if cfg.OutputBufferSize == 0 {
		cfg.OutputBufferSize = 16
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}

	return &BatchAssembler{
		maxEvents:     cfg.MaxEvents,
		flushInterval: cfg.FlushInterval,
		nodeName:      cfg.NodeName,
		logger:        cfg.Logger,
		current:       make([]*pb.TelemetryEvent, 0, cfg.MaxEvents),
		output:        make(chan *pb.TelemetryBatch, cfg.OutputBufferSize),
		done:          make(chan struct{}),
	}
}

// Add adds a tagged event to the current batch.
// If the batch reaches maxEvents, it is flushed immediately.
func (b *BatchAssembler) Add(evt TaggedEvent) {
	protoEvt := taggedEventToProto(evt)

	b.mu.Lock()
	b.current = append(b.current, protoEvt)
	shouldFlush := len(b.current) >= b.maxEvents
	b.mu.Unlock()

	if shouldFlush {
		b.flush()
	}
}

// Start begins the periodic flush timer. Call this in a goroutine.
// It returns when the done channel is closed.
func (b *BatchAssembler) Start() {
	ticker := time.NewTicker(b.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			b.flush()
		case <-b.done:
			b.flush() // final flush
			close(b.output)
			return
		}
	}
}

// Stop signals the assembler to flush remaining events and stop.
func (b *BatchAssembler) Stop() {
	close(b.done)
}

// Batches returns a read-only channel of completed batches.
func (b *BatchAssembler) Batches() <-chan *pb.TelemetryBatch {
	return b.output
}

// flush sends the current batch to the output channel.
func (b *BatchAssembler) flush() {
	b.mu.Lock()
	if len(b.current) == 0 {
		b.mu.Unlock()
		return
	}

	events := b.current
	b.current = make([]*pb.TelemetryEvent, 0, b.maxEvents)
	b.mu.Unlock()

	batch := &pb.TelemetryBatch{
		NodeName:         b.nodeName,
		BatchTimestampNs: time.Now().UnixNano(),
		Events:           events,
	}

	// Non-blocking send — drop batch if output channel is full (backpressure)
	select {
	case b.output <- batch:
		b.logger.Debug("batch flushed", "event_count", len(events))
	default:
		b.logger.Warn("batch dropped (output buffer full)", "event_count", len(events))
	}
}

// taggedEventToProto converts a TaggedEvent to a protobuf TelemetryEvent.
func taggedEventToProto(evt TaggedEvent) *pb.TelemetryEvent {
	protoEvt := &pb.TelemetryEvent{
		WorkloadKey: evt.Identity.WorkloadKey,
		TimestampNs: int64(evt.TimestampNs),
	}

	switch p := evt.Payload.(type) {
	case PageFaultPayload:
		protoEvt.EventType = pb.EventType_EVENT_TYPE_PAGE_FAULT
		protoEvt.Payload = &pb.TelemetryEvent_PageFault{
			PageFault: &pb.PageFaultEvent{
				IsMajor: p.IsMajor,
				Address: p.Address,
			},
		}

	case CacheMissPayload:
		protoEvt.EventType = pb.EventType_EVENT_TYPE_CACHE_MISS
		protoEvt.Payload = &pb.TelemetryEvent_CacheMiss{
			CacheMiss: &pb.CacheMissEvent{
				MissCountDelta: p.MissCountDelta,
			},
		}

	case LockContentionPayload:
		protoEvt.EventType = pb.EventType_EVENT_TYPE_LOCK_CONTENTION
		protoEvt.Payload = &pb.TelemetryEvent_LockContention{
			LockContention: &pb.LockContentionEvent{
				LockAddress: p.LockAddress,
				DurationNs:  p.DurationNs,
			},
		}

	case CtxSwitchPayload:
		protoEvt.EventType = pb.EventType_EVENT_TYPE_CONTEXT_SWITCH
		protoEvt.Payload = &pb.TelemetryEvent_CtxSwitch{
			CtxSwitch: &pb.ContextSwitchEvent{
				PrevState: p.PrevState,
			},
		}
	}

	return protoEvt
}
