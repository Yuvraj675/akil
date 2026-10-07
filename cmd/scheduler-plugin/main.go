//go:build ignore


package main

import (
	"os"

	"k8s.io/kubernetes/cmd/kube-scheduler/app"

	"github.com/Yuvraj675/akil/pkg/scoring"
)

func main() {
	// Register the custom AKIL Score plugin
	command := app.NewSchedulerCommand(
		app.WithPlugin(scoring.Name, scoring.New),
	)

	if err := command.Execute(); err != nil {
		os.Exit(1)
	}
}
