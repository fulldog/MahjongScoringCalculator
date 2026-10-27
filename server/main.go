package main

import (
	"fmt"
	"os"

	"github.com/fulldog/MahjongScoringCalculator/server/internal/app"
	"github.com/fulldog/MahjongScoringCalculator/server/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "config: %v\n", err)
		os.Exit(1)
	}
	if err := app.Run(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}
