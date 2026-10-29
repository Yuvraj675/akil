package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/Yuvraj675/akil/pkg/profile"
	pb "github.com/Yuvraj675/akil/pkg/proto"
)

// BenchmarkScoreQueries measures the aggregator round-trips one Score() call makes
// (QueryProfile for the candidate + QueryNodeProfiles for the node) over loopback TCP.
// It excludes cluster network latency, so it is a lower bound for in-cluster cost.
func BenchmarkScoreQueries(b *testing.B) {
	for _, m := range []int{1, 5, 10, 20, 50, 100} {
		b.Run(fmt.Sprintf("colocated=%d", m), func(b *testing.B) {
			store := profile.NewStore(12, 5*time.Second)
			store.GetOrCreate("default/Deployment/web").RecordBulk(350, 120000, 2500, 4e7, "node-x")
			for i := 0; i < m; i++ {
				store.GetOrCreate(fmt.Sprintf("default/Deployment/w%d", i)).RecordBulk(1200, 900000, 4000, 8e7, "node-1")
			}

			lis, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				b.Fatal(err)
			}
			srv := grpc.NewServer()
			pb.RegisterAkilTelemetryServer(srv, &aggregatorService{store: store, logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
			go srv.Serve(lis)
			defer srv.Stop()

			conn, err := grpc.NewClient(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				b.Fatal(err)
			}
			defer conn.Close()
			client := pb.NewAkilTelemetryClient(conn)
			ctx := context.Background()

			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if _, err := client.QueryProfile(ctx, &pb.ProfileRequest{WorkloadKey: "default/Deployment/web"}); err != nil {
					b.Fatal(err)
				}
				if _, err := client.QueryNodeProfiles(ctx, &pb.NodeProfilesRequest{NodeName: "node-1"}); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}
