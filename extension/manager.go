package extension

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"path"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/sync/errgroup"
)

type extension struct {
	Extension
	id string
}

// ExtensionsManager manages starting and stopping of all extensions.
type ExtensionsManager struct {
	extensions []extension
}

// NewExtensionsManager creates a new ExtensionsManager.
func NewExtensionsManager(cfg map[string]json.RawMessage) (*ExtensionsManager, error) {
	return NewExtensionsManagerFromExtensions(cfg, extensions)
}

// NewExtensionsManagerFromExtensions creates a new ExtensionManager from a list
// of extensions.
func NewExtensionsManagerFromExtensions(extensionConfigs map[string]json.RawMessage, extensionInfos []ExtensionInfo) (*ExtensionsManager, error) {
	var firstErr error
	extensions := make([]extension, 0, len(extensionInfos))

	for _, ext := range extensionInfos {
		ecfg, ok := extensionConfigs[ext.ID]
		if !ok {
			slog.Debug(
				"skipping extension since no config was provided",
				"extension", ext.ID)
			continue
		}

		e, err := ext.New(ecfg)
		if err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("failed to create extension %q: %w", ext.ID, err)
			}
			continue
		}

		extensions = append(extensions, extension{e, ext.ID})
	}

	if firstErr != nil {
		for _, ext := range extensions {
			ext.Stop()
		}
		return nil, firstErr
	}

	return &ExtensionsManager{extensions}, nil
}

// Start starts all extensions.
func (m *ExtensionsManager) Start(ctx context.Context) error {
	wg, ctx := errgroup.WithContext(ctx)
	for _, ext := range m.extensions {
		ext := ext
		wg.Go(func() error { return ext.Start(ctx) })
	}
	return wg.Wait()
}

// Stop stops all extensions.
func (m *ExtensionsManager) Stop() error {
	var wg errgroup.Group
	for _, ext := range m.extensions {
		ext := ext
		wg.Go(func() error { return ext.Stop() })
	}
	return wg.Wait()
}

// BindRouter binds all extensions that implement ExtensionHTTPHandler to the
// router. The extension
func (m *ExtensionsManager) BindRouter(router chi.Router) {
	router = router.With(middleware.CleanPath)

	for _, ext := range m.extensions {
		handler, ok := ext.Extension.(ExtensionHTTPHandler)
		if !ok {
			continue
		}

		middleware := func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				ctx := r.Context()
				ctx = context.WithValue(ctx, ctxKeyExtension, ext.id)
				ctx = context.WithValue(ctx, ctxKeySlog,
					LoggerFromContext(ctx).With("extension", ext.id))
				next.ServeHTTP(w, r.WithContext(ctx))
			})
		}

		router.With(middleware).Mount("/"+path.Join("x", ext.id), handler)
	}

	router.Get("/x", func(w http.ResponseWriter, r *http.Request) {
		extensionIDs := make([]string, 0, len(m.extensions))
		for _, ext := range m.extensions {
			extensionIDs = append(extensionIDs, ext.id)
		}
		json.NewEncoder(w).Encode(extensionIDs)
	})
}

// JSPaths returns the paths to all JS files that should be loaded for all
// extensions.
func (m *ExtensionsManager) JSPaths() []string {
	var paths []string
	for _, ext := range m.extensions {
		if hookable, ok := ext.Extension.(ExtensionJSHookable); ok {
			paths = append(paths, "/"+path.Join("x", ext.id, hookable.JSPath()))
		}
	}
	return paths
}
