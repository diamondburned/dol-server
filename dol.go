package main

import (
	"bytes"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	_ "embed"

	"github.com/go-chi/chi/v5"
	"libdb.so/dol-server/extension"
	"libdb.so/dol-server/internal/httputil"
)

func newDoLServer(gamePath string, extensions *extension.ExtensionsManager) (http.Handler, error) {
	// Attempt to find the HTML file.
	dolHTMLFiles, err := filepath.Glob(filepath.Join(gamePath, "*.html"))
	if err != nil {
		return nil, fmt.Errorf("failed to find HTML files in DoL path: %w", err)
	}
	if len(dolHTMLFiles) != 1 {
		return nil, fmt.Errorf("found %d HTML files in DoL path, expected 1", len(dolHTMLFiles))
	}

	slog.Debug(
		"found Degrees of Lewdity HTML file",
		"file", dolHTMLFiles[0],
		"path", gamePath)

	// Patch the DoL HTML file to include the scripts.
	dolHTML, err := patchDoLHTML(dolHTMLFiles[0], extensions.JSPaths())
	if err != nil {
		return nil, fmt.Errorf("failed to patch DoL HTML file: %w", err)
	}

	fs := http.FileServer(http.Dir(gamePath))

	r := chi.NewMux()
	extensions.BindRouter(r)

	r.Get("/", httputil.BytesServer("text/html", dolHTML))
	r.Mount("/", fs)

	return r, nil
}

func patchDoLHTML(htmlFile string, scripts []string) ([]byte, error) {
	var extras bytes.Buffer
	for _, script := range scripts {
		slog.Debug(
			"patching Degrees of Lewdity HTML file with JS script",
			"script", script)
		fmt.Fprintf(&extras, `<script src="%s" type="module"></script>`, script)
	}

	html, err := os.ReadFile(htmlFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read DoL HTML file: %w", err)
	}

	html = bytes.Replace(html,
		[]byte("</head>"),
		append(extras.Bytes(), []byte("</head>")...), 1)

	return html, nil
}
