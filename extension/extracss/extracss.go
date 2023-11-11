package extracss

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"libdb.so/dol-server/extension"
	"libdb.so/dol-server/internal/httputil"
)

//go:embed *.css
var cssFiles embed.FS

var cssPaths = func() []string {
	files, _ := cssFiles.ReadDir(".")
	paths := make([]string, len(files))
	for i, file := range files {
		paths[i] = "/x/extracss/" + file.Name()
	}
	return paths
}()

// Extension is the extension info for the extracss extension.
var Extension = extension.ExtensionInfo{
	ID:  "extracss",
	New: New,
}

func init() { extension.Register(Extension) }

type extraCSSExtension struct {
	*chi.Mux
}

var (
	_ extension.Extension            = (*extraCSSExtension)(nil)
	_ extension.ExtensionHTTPHandler = (*extraCSSExtension)(nil)
	_ extension.ExtensionJSHookable  = (*extraCSSExtension)(nil)
)

// New returns a new extracss extension.
func New(json.RawMessage) (extension.Extension, error) {
	var injector bytes.Buffer
	injector.WriteString(`const cssPaths = `)
	if err := json.NewEncoder(&injector).Encode(cssPaths); err != nil {
		panic(fmt.Sprintf("failed to encode css paths: %v", err))
	}

	injector.WriteString(`
		for (const url of cssPaths) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = url;
			document.head.appendChild(link);
		}
	`)

	e := &extraCSSExtension{Mux: chi.NewMux()}
	e.Get("/inject.js", httputil.BytesServer("text/javascript", injector.Bytes()))
	e.Mount("/", http.StripPrefix("/x/extracss", http.FileServer(http.FS(cssFiles))))

	return e, nil
}

// Start implements the extension.Extension interface.
func (e *extraCSSExtension) Start(context.Context) error { return nil }

// Stop implements the extension.Extension interface.
func (e *extraCSSExtension) Stop() error { return nil }

// JSPath implements the extension.ExtensionJSHookable interface.
func (e *extraCSSExtension) JSPath() string { return "/inject.js" }
