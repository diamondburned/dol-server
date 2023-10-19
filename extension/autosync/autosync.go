package autosync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	_ "embed"

	"github.com/go-chi/chi/v5"
	"github.com/gofrs/flock"
	"libdb.so/dol-server/extension"
	"libdb.so/dol-server/internal/httputil"
)

//go:generate deno bundle autosync.ts autosync_generated.js
//go:embed autosync_generated.js
var autosyncScript []byte

// Extension is the extension info for the autosync extension.
var Extension = extension.ExtensionInfo{
	ID:  "autosync",
	New: New,
}

func init() { extension.Register(Extension) }

// Config is the configuration for the autosync extension.
type Config struct {
	// SavePath is the path to save the autosync data to.
	// If unset, os.UserConfigDir() is used.
	SavePath string `json:"save_path"`
}

type autosyncExtension struct {
	*chi.Mux
	cfg      Config
	saveFile string
	saveLock *flock.Flock
}

var (
	_ extension.Extension            = (*autosyncExtension)(nil)
	_ extension.ExtensionHTTPHandler = (*autosyncExtension)(nil)
	_ extension.ExtensionJSHookable  = (*autosyncExtension)(nil)
)

// New returns a new autosync extension.
func New(cfgJSON json.RawMessage) (extension.Extension, error) {
	var cfg Config
	if err := json.Unmarshal(cfgJSON, &cfg); err != nil {
		return nil, fmt.Errorf("unmarshaling config: %w", err)
	}

	if cfg.SavePath == "" {
		base, err := os.UserConfigDir()
		if err != nil {
			return nil, fmt.Errorf("getting user config dir: %w", err)
		}
		cfg.SavePath = filepath.Join(base, "dol-server", "autosync")
	}

	if err := os.MkdirAll(cfg.SavePath, 0755); err != nil {
		return nil, fmt.Errorf("creating save path: %w", err)
	}

	e := &autosyncExtension{
		Mux:      chi.NewRouter(),
		cfg:      cfg,
		saveFile: filepath.Join(cfg.SavePath, "autosync.dat"),
		saveLock: flock.New(filepath.Join(cfg.SavePath, "autosync.lock")),
	}

	e.Get("/autosync.js", httputil.BytesServer("application/javascript", autosyncScript))
	e.HandleFunc("/merge", e.handleMerge)

	return e, nil
}

func (e *autosyncExtension) handleMerge(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		release, err := e.acquireSaveData(r.Context())
		if err != nil {
			writeMergeError(w, 500, fmt.Errorf("acquiring server save data: %w", err))
			return
		}
		defer release()

		serverSave, err := e.readSaveData()
		if err != nil {
			writeMergeError(w, 500, fmt.Errorf("reading server save data: %w", err))
			return
		}

		writeJSON(w, 200, serverSave)

	case http.MethodPost:
		clientSave, err := readSaveDataFromRequest(r)
		if err != nil {
			writeMergeError(w, 400, fmt.Errorf("reading client save data: %w", err))
			return
		}

		release, err := e.acquireSaveData(r.Context())
		if err != nil {
			writeMergeError(w, 500, fmt.Errorf("acquiring server save data: %w", err))
			return
		}
		defer release()

		serverSave, err := e.readSaveData()
		if err != nil {
			writeMergeError(w, 500, fmt.Errorf("reading server save data: %w", err))
			return
		}

		clientIsOutdated := serverSave.Date > clientSave.Date

		log := extension.LoggerFromContext(r.Context())
		log.Debug(
			"syncing autosync data",
			"server_save_file", e.saveFile,
			"server_save_date", serverSave.Date,
			"client_save_date", clientSave.Date,
			"client_is_outdated", clientIsOutdated)

		if clientIsOutdated {
			// Remote is outdated.
			// The client should update the client save data.
			writeMergeResult(w, 409, MergeOutdatedData(*serverSave))
			return
		}

		changed := serverSave.Date != clientSave.Date
		if changed {
			// Server is outdated, so simply save the server data.
			if err := e.writeSaveData(clientSave); err != nil {
				writeMergeError(w, 500, fmt.Errorf("writing save data: %w", err))
				return
			}
		}

		writeMergeResult(w, 200, MergeOKData{Changed: changed})
	default:
		writeMergeError(w, 405, fmt.Errorf("method not allowed"))
	}
}

// MergeResult is the result of a merge operation.
type MergeResult string

const (
	// MergeError is returned when the merge operation failed.
	MergeError MergeResult = "error"
	// MergeOK is returned when the merge operation succeeded.
	// This means the client save data is up-to-date and has been written.
	MergeOK MergeResult = "ok"
	// MergeOutdated is returned when the merge operation failed because
	// the server save data is outdated. The client should update the server
	// save data.
	MergeOutdated MergeResult = "outdated"
)

type MergeOKData struct {
	Changed bool `json:"changed"`
}

type MergeErrorData struct {
	Error string `json:"error"`
}

type MergeOutdatedData SaveData

type mergeResultData interface{ mergeResult() MergeResult }

func (MergeOKData) mergeResult() MergeResult       { return MergeOK }
func (MergeErrorData) mergeResult() MergeResult    { return MergeError }
func (MergeOutdatedData) mergeResult() MergeResult { return MergeOutdated }

func writeJSON(w http.ResponseWriter, code int, obj any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(obj)
}

func writeMergeResult(w http.ResponseWriter, code int, data mergeResultData) {
	writeJSON(w, code, struct {
		Result MergeResult     `json:"result"`
		Data   mergeResultData `json:"data,omitempty"`
	}{
		Result: data.mergeResult(),
		Data:   data,
	})
}

func writeMergeError(w http.ResponseWriter, code int, err error) {
	writeMergeResult(w, code, MergeErrorData{Error: err.Error()})
}

// SaveData describes the save data along with a pseudo-timestamp of the last
// user action.
type SaveData struct {
	Date uint64 `json:"date"`
	Data []byte `json:"data"`
}

func readSaveDataFromRequest(r *http.Request) (*SaveData, error) {
	var data SaveData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decoding request body: %w", err)
	}
	return &data, nil
}

func (e *autosyncExtension) acquireSaveData(ctx context.Context) (release func(), err error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err = e.saveLock.TryLockContext(ctx, 250*time.Millisecond)
	if err != nil {
		return nil, fmt.Errorf("acquiring save data lock: %w", err)
	}

	return func() {
		if err := e.saveLock.Unlock(); err != nil {
			panic(fmt.Errorf("releasing save data lock: %w", err))
		}
	}, nil
}

func (e *autosyncExtension) readSaveData() (*SaveData, error) {
	f, err := os.Open(e.saveFile)
	if err != nil {
		if os.IsNotExist(err) {
			return &SaveData{}, nil
		}
		return nil, fmt.Errorf("opening save file: %w", err)
	}
	defer f.Close()

	var data SaveData
	if err := json.NewDecoder(f).Decode(&data); err != nil {
		return nil, fmt.Errorf("decoding save file: %w", err)
	}

	return &data, nil
}

func (e *autosyncExtension) writeSaveData(data *SaveData) error {
	f, err := os.Create(e.saveFile)
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	defer f.Close()

	if err := json.NewEncoder(f).Encode(data); err != nil {
		return fmt.Errorf("writing save data: %w", err)
	}

	if err := f.Close(); err != nil {
		return fmt.Errorf("closing save file: %w", err)
	}

	return nil
}

// ID implements extension.Extension.
func (e *autosyncExtension) ID() string { return "autosync" }

// Start implements extension.Extension.
func (e *autosyncExtension) Start(context.Context) error { return nil }

// Stop implements extension.Extension.
func (e *autosyncExtension) Stop() error { return nil }

// JSPath implements extension.ExtensionJSHookable.
func (e *autosyncExtension) JSPath() string { return "/autosync.js" }
