package httputil

import (
	"bytes"
	"net/http"
	"time"

	"github.com/hhsnopek/etag"
)

// BytesServer returns a http.Handler that serves the given bytes as a file.
func BytesServer(mimeType string, b []byte) http.HandlerFunc {
	etag := etag.Generate(b, false)
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Cache-Control", "public, max-age=31536000, must-revalidate")
		w.Header().Set("ETag", etag)
		http.ServeContent(w, r, "index.html", time.Time{}, bytes.NewReader(b))
	}
}
