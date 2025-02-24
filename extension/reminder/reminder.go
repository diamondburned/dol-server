package reminder

import (
	"context"
	"encoding/json"

	_ "embed"

	"github.com/go-chi/chi/v5"
	"libdb.so/dol-server/extension"
	"libdb.so/dol-server/internal/httputil"
)

//go:generate deno bundle reminder.ts reminder_generated.js
//go:embed reminder_generated.js
var reminderScript []byte

//go:embed reminder.css
var reminderCSS []byte

// Extension is the extension info for the reminder extension.
var Extension = extension.ExtensionInfo{
	ID:  "reminder",
	New: New,
}

func init() { extension.Register(Extension) }

type reminderExtension struct {
	*chi.Mux
}

var (
	_ extension.Extension            = (*reminderExtension)(nil)
	_ extension.ExtensionHTTPHandler = (*reminderExtension)(nil)
	_ extension.ExtensionJSHookable  = (*reminderExtension)(nil)
)

func New(_ json.RawMessage) (extension.Extension, error) {
	e := &reminderExtension{Mux: chi.NewMux()}
	e.Get("/reminder.js", httputil.BytesServer("application/javascript", reminderScript))
	e.Get("/reminder.css", httputil.BytesServer("text/css", reminderCSS))
	return e, nil
}

func (e *reminderExtension) Start(context.Context) error { return nil }
func (e *reminderExtension) Stop() error                 { return nil }
func (e *reminderExtension) JSPaths() []string           { return []string{"/reminder.js"} }
