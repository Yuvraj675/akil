package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"text/tabwriter"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/Yuvraj675/akil/pkg/proto"
)

func main() {
	addr := flag.String("addr", "localhost:50051", "Address of the aggregator")
	node := flag.String("node", "", "Node name to query (leave empty for specific workload)")
	workload := flag.String("workload", "", "Workload key to query (e.g. default/Deployment/cache-stress)")
	watch := flag.Bool("watch", false, "Continuously watch the metrics every 2 seconds")
	flag.Parse()

	if *node == "" && *workload == "" {
		log.Fatal("You must specify either --node or --workload")
	}

	conn, err := grpc.NewClient(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	client := pb.NewAkilTelemetryClient(conn)

	for {
		// Clear screen if watching
		if *watch {
			fmt.Print("\033[H\033[2J")
			fmt.Printf("AKIL Telemetry Monitor - %s\n\n", time.Now().Format(time.RFC1123))
		}

		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "WORKLOAD\tPAGE FAULTS/s\tCACHE MISSES/s\tLOCK CONTENTION\tCTX SWITCHES/s\tCONFIDENCE")
		fmt.Fprintln(w, "--------\t-------------\t--------------\t---------------\t--------------\t----------")

		if *node != "" {
			resp, err := client.QueryNodeProfiles(context.Background(), &pb.NodeProfilesRequest{NodeName: *node})
			if err != nil {
				log.Fatalf("Failed to query node: %v", err)
			}
			for _, p := range resp.Profiles {
				printProfile(w, p)
			}
		} else if *workload != "" {
			resp, err := client.QueryProfile(context.Background(), &pb.ProfileRequest{WorkloadKey: *workload})
			if err != nil {
				log.Fatalf("Failed to query workload: %v", err)
			}
			printProfile(w, resp)
		}

		w.Flush()

		if !*watch {
			break
		}
		time.Sleep(2 * time.Second)
	}
}

func printProfile(w *tabwriter.Writer, p *pb.RuntimeProfile) {
	fmt.Fprintf(w, "%s\t%.2f\t%.2f\t%.4f\t%.2f\t%s\n",
		p.WorkloadKey,
		p.PageFaultRate,
		p.CacheMissRate,
		p.LockContentionRatio,
		p.ContextSwitchRate,
		p.Confidence.String(),
	)
}
