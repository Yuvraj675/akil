package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"encoding/binary"
	"runtime"

	cebpf "github.com/cilium/ebpf"
	"golang.org/x/sys/unix"

	"github.com/Yuvraj675/akil/pkg/cgroup"
	"github.com/Yuvraj675/akil/pkg/ebpf"
	pb "github.com/Yuvraj675/akil/pkg/proto"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
)

var (
	aggregatorAddr = flag.String("aggregator", "localhost:50051", "Aggregator gRPC address")
	nodeName       = flag.String("node-name", "worker-node-01", "Node name reporting")
	samplePeriod   = flag.Uint64("cache-miss-sample-period", 10000, "LLC misses per perf_event sample")
)

func main() {
	flag.Parse()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	slog.SetDefault(logger)
	
	logger.Info("AKIL Collector starting", "node", *nodeName, "aggregator", *aggregatorAddr)

	// Load pre-compiled eBPF programs
	spec, err := ebpf.LoadBpf()
	if err != nil {
		logger.Error("failed to load spec", "error", err)
		os.Exit(1)
	}
	if err := spec.Variables[ebpf.BpfVarCacheMissSamplePeriod].Set(*samplePeriod); err != nil {
		logger.Error("failed to set sample period", "error", err)
		os.Exit(1)
	}
	var objs ebpf.BpfObjects
	if err := spec.LoadAndAssign(&objs, nil); err != nil {
		logger.Error("failed to load objects", "error", err)
		os.Exit(1)
	}
	defer objs.Close()

	// Attach tracepoints
	tpPF, err := link.Tracepoint("exceptions", "page_fault_user", objs.HandlePageFault, nil)
	if err != nil {
		logger.Error("failed to attach page fault", "error", err)
		os.Exit(1)
	}
	defer tpPF.Close()

	tpCS, err := link.Tracepoint("sched", "sched_switch", objs.HandleSchedSwitch, nil)
	if err != nil {
		logger.Error("failed to attach sched switch", "error", err)
		os.Exit(1)
	}
	defer tpCS.Close()

	// Lock contention tracepoints exist from kernel 5.19; run without them on older kernels.
	if tp, err := link.Tracepoint("lock", "contention_begin", objs.HandleContentionBegin, nil); err != nil {
		logger.Warn("lock contention probe unavailable", "error", err)
	} else {
		defer tp.Close()
		if tp2, err := link.Tracepoint("lock", "contention_end", objs.HandleContentionEnd, nil); err != nil {
			logger.Warn("lock contention probe unavailable", "error", err)
		} else {
			defer tp2.Close()
		}
	}

	// One sampling LLC-miss counter per CPU, each running the cache-miss program on overflow.
	perfFDs, err := attachCacheMissCounters(objs.HandleCacheMiss, *samplePeriod)
	if err != nil {
		logger.Warn("cache miss probe unavailable", "error", err)
	}
	defer func() {
		for _, fd := range perfFDs {
			unix.Close(fd)
		}
	}()

	logger.Info("eBPF probes attached", "cache_miss_cpus", len(perfFDs))

	// Open BPF ring buffer
	reader, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		logger.Error("failed to create ringbuf reader", "error", err)
		os.Exit(1)
	}
	defer reader.Close()

	
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


	// Connect to aggregator
	conn, err := grpc.Dial(*aggregatorAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		logger.Error("failed to connect to aggregator", "error", err)
		os.Exit(1)
	}
	defer conn.Close()

	client := pb.NewAkilTelemetryClient(conn)
	openStream := func() (pb.AkilTelemetry_StreamTelemetryClient, error) {
		s, err := client.StreamTelemetry(ctx)
		if err != nil {
			return nil, err
		}
		// The aggregator acks every batch. Unread acks fill the flow-control window,
		// its Send blocks, and it stops receiving, so drain them.
		go func() {
			for {
				if _, err := s.Recv(); err != nil {
					return
				}
			}
		}()
		return s, nil
	}
	stream, err := openStream()
	if err != nil {
		logger.Error("failed to open telemetry stream", "error", err)
		os.Exit(1)
	}

	logger.Info("Streaming to aggregator...")

	go func() {
		<-ctx.Done()
		reader.Close()
	}()

	batch := &pb.TelemetryBatch{
		NodeName: *nodeName,
		Events:   make([]*pb.TelemetryEvent, 0, 100),
	}
	
	lastFlush := time.Now()

	for {
		record, err := reader.Read()
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			logger.Error("read from ringbuf failed", "error", err)
			continue
		}

		if len(record.RawSample) < 24 {
			continue
		}

		// Parse the struct event_t
		eventType := record.RawSample[0]
		// Cgroup ID is bytes 8-15, Timestamp is bytes 16-23 (little endian, assuming 64-bit aligned)
		
		cgroupID := binary.LittleEndian.Uint64(record.RawSample[8:16])
		
		wk := ""
		if resolver != nil {
			wk = resolver.Resolve(cgroupID)
		}
		if wk == "" {
			// fallback or ignore if not a k8s pod
			continue
		}

		evt := &pb.TelemetryEvent{
			EventType:   pb.EventType(eventType),
			WorkloadKey: wk,
			TimestampNs: time.Now().UnixNano(),
		}
		// Payload union starts at byte 24 of struct event_t.
		if len(record.RawSample) >= 32 {
			payload := binary.LittleEndian.Uint64(record.RawSample[24:32])
			switch evt.EventType {
			case pb.EventType_EVENT_TYPE_CACHE_MISS:
				evt.Payload = &pb.TelemetryEvent_CacheMiss{CacheMiss: &pb.CacheMissEvent{MissCountDelta: payload}}
			case pb.EventType_EVENT_TYPE_LOCK_CONTENTION:
				evt.Payload = &pb.TelemetryEvent_LockContention{LockContention: &pb.LockContentionEvent{DurationNs: int64(payload)}}
			}
		}

		batch.Events = append(batch.Events, evt)

		if len(batch.Events) >= 100 || time.Since(lastFlush) > time.Second {
			batch.BatchTimestampNs = time.Now().UnixNano()
			if err := stream.Send(batch); err != nil {
				// The stream is dead once Send fails (e.g. the aggregator restarted),
				// so reopen it; the batch is dropped rather than buffered.
				logger.Warn("failed to send batch, reopening stream", "error", err)
				if s, err := openStream(); err == nil {
					stream = s
				}
			}
			batch.Events = make([]*pb.TelemetryEvent, 0, 100)
			lastFlush = time.Now()
		}
	}
	
	logger.Info("Collector shutdown complete")
}

// attachCacheMissCounters opens a sampling PERF_COUNT_HW_CACHE_MISSES counter on every
// online CPU and attaches prog to each. On hybrid CPUs the kernel routes the generic
// hardware event to the PMU of the CPU it is opened on.
func attachCacheMissCounters(prog *cebpf.Program, period uint64) ([]int, error) {
	var fds []int
	for cpu := 0; cpu < runtime.NumCPU(); cpu++ {
		attr := unix.PerfEventAttr{
			Type:   unix.PERF_TYPE_HARDWARE,
			Config: unix.PERF_COUNT_HW_CACHE_MISSES,
			Size:   unix.PERF_ATTR_SIZE_VER7,
			Sample: period,
			Bits:   unix.PerfBitDisabled,
		}
		fd, err := unix.PerfEventOpen(&attr, -1, cpu, -1, unix.PERF_FLAG_FD_CLOEXEC)
		if err != nil {
			for _, f := range fds {
				unix.Close(f)
			}
			return nil, err
		}
		if err := unix.IoctlSetInt(fd, unix.PERF_EVENT_IOC_SET_BPF, prog.FD()); err != nil {
			unix.Close(fd)
			return fds, err
		}
		if err := unix.IoctlSetInt(fd, unix.PERF_EVENT_IOC_ENABLE, 0); err != nil {
			unix.Close(fd)
			return fds, err
		}
		fds = append(fds, fd)
	}
	return fds, nil
}

