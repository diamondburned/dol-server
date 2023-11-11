package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"time"

	"github.com/skratchdot/open-golang/open"
	"github.com/spf13/pflag"
	"libdb.so/dol-server/extension"
	"libdb.so/hserve"

	_ "libdb.so/dol-server/extension/autosync"
	_ "libdb.so/dol-server/extension/extracss"
)

var (
	listenAddr  = ":19384" // TODO: allow picking a random port
	config      = "dol-server.json"
	verbose     = false
	openBrowser = false
)

func init() {
	pflag.StringVarP(&listenAddr, "listen-addr", "l", listenAddr, "address to listen on")
	pflag.StringVarP(&config, "config", "c", config, "path to config file")
	pflag.BoolVarP(&verbose, "verbose", "v", verbose, "enable verbose logging")
	pflag.BoolVar(&openBrowser, "open-browser", openBrowser, "open browser on startup")
	pflag.Parse()

	logLevel := slog.LevelInfo
	if verbose {
		logLevel = slog.LevelDebug
	}

	slog.SetDefault(
		slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
			Level: logLevel,
		})),
	)
}

type Config struct {
	GamePath   string                     `json:"game_path"`
	Extensions map[string]json.RawMessage `json:"extensions,omitempty"`
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	if err := start(ctx); err != nil {
		log.Fatalln("error occured", err)
	}
}

func start(ctx context.Context) error {
	cfgData, err := os.ReadFile(config)
	if err != nil {
		return fmt.Errorf("reading config file: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(cfgData, &cfg); err != nil {
		return fmt.Errorf("unmarshaling config file: %w", err)
	}

	extensions, err := extension.NewExtensionsManager(cfg.Extensions)
	if err != nil {
		return fmt.Errorf("creating extensions manager: %w", err)
	}

	dol, err := newDoLServer(cfg.GamePath, extensions)
	if err != nil {
		return fmt.Errorf("creating DoL server: %w", err)
	}

	if err := extensions.Start(ctx); err != nil {
		return fmt.Errorf("starting extensions: %w", err)
	}

	// Convert address to URL
	url, err := url.Parse("http://" + listenAddr)
	if err != nil {
		// This should always be a valid URL.
		return fmt.Errorf("invalid address: %w", err)
	}

	if openBrowser {
		if url.Hostname() == "" {
			// Allow :port syntax
			url.Host = "localhost" + url.Host
		}
		go func() {
			if err := waitAndOpenURL(ctx, url.String()); err != nil {
				log.Println("failed to open browser:", err)
			}
		}()
	}

	log.Println("listening on", listenAddr)
	return hserve.ListenAndServe(ctx, listenAddr, dol)
}

func waitAndOpenURL(ctx context.Context, url string) error {
	for {
		r, err := http.Get(url)
		if err == nil {
			r.Body.Close()
			slog.DebugContext(ctx,
				"server has started",
				"url", url)
			break
		}

		slog.DebugContext(ctx,
			"still waiting for server to start",
			"url", url,
			"error", err)

		t := time.NewTimer(500 * time.Millisecond)
		select {
		case <-ctx.Done():
			t.Stop()
			return ctx.Err()
		case <-t.C:
		}
	}

	return open.Run(url)
}
