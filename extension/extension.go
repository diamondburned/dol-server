package extension

import (
	"context"
	"encoding/json"
	"net/http"
)

// Extension is an interface that defines the lifecycle of an extension.
type Extension interface {
	// Start starts the extension.
	Start(ctx context.Context) error
	// Stop stops the extension.
	Stop() error
}

// ExtensionHTTPHandler is an extension that implements http.Handler.
type ExtensionHTTPHandler interface {
	Extension
	http.Handler
}

// ExtensionJSHookable is an extension that can be hooked into the JS runtime.
// It must implement ExtensionHTTPHandler.
type ExtensionJSHookable interface {
	Extension
	ExtensionHTTPHandler
	// JSPaths returns the paths to the JS files that should be loaded for this
	// extension. It is relative to the root of the extension.
	JSPaths() []string
}

// ExtensionInfo is a struct that contains information about an extension.
// It supplies a constructor that creates an extension from a config.
type ExtensionInfo struct {
	ID  string
	New func(cfg json.RawMessage) (Extension, error)
}

var extensions []ExtensionInfo

// Register registers an extension.
func Register(ext ExtensionInfo) {
	extensions = append(extensions, ext)
}
