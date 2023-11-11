package autosync

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
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
	e.Get("/save", e.getSave)
	e.Post("/merge", e.handleMerge)

	return e, nil
}

func (e *autosyncExtension) getSave(w http.ResponseWriter, r *http.Request) {
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

	type GetSyncResponse struct {
		Save       *SaveData `json:"save"`
		ServerHash string    `json:"server_hash,omitempty"`
	}

	writeJSON(w, 200, GetSyncResponse{
		Save:       serverSave,
		ServerHash: hashData(serverSave),
	})
}

func (e *autosyncExtension) handleMerge(w http.ResponseWriter, r *http.Request) {
	clientSave, err := readSaveDataFromRequest(r)
	if err != nil {
		writeMergeError(w, 400, fmt.Errorf("reading client save data: %w", err))
		return
	}

	clientSaveHash := hashData(&clientSave.SaveData)
	clientLastHash := clientSave.LastHash

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

	if r.FormValue("override") != "" || serverSave == nil {
		log := extension.LoggerFromContext(r.Context())
		log.Debug("overriding autosync data")

		// Client commands to override the server save data.
		// This is usually done with user confirmation.
		if err := e.writeSaveData(&clientSave.SaveData); err != nil {
			writeMergeError(w, 500, fmt.Errorf("writing save data: %w", err))
			return
		}

		writeMergeResult(w, 200, MergeOKData{
			Consistent: false,
			Hash:       clientSaveHash,
		})
		return
	}

	serverSaveHash := hashData(serverSave)
	conflicting := serverSaveHash != clientLastHash

	log := extension.LoggerFromContext(r.Context())
	log.Debug(
		"syncing autosync data",
		"server_save_date", time.UnixMilli(serverSave.Date),
		"server_save_hash", stringMaxLen(serverSaveHash, 8),
		"client_last_hash", stringMaxLen(clientLastHash, 8),
		"client_save_hash", stringMaxLen(clientSaveHash, 8),
		"conflicting", conflicting)

	if conflicting {
		// Remote is outdated.
		// The client should update the client save data.
		writeMergeResult(w, 409, MergeConflictData{
			Save:       serverSave,
			ServerHash: serverSaveHash,
		})
		return
	}

	// Things look consistent, so merge the data.
	if err := e.writeSaveData(&clientSave.SaveData); err != nil {
		writeMergeError(w, 500, fmt.Errorf("writing save data: %w", err))
		return
	}

	writeMergeResult(w, 200, MergeOKData{
		Consistent: true,
		Hash:       clientSaveHash,
	})
}

// MergeResult is the result of a merge operation.
type MergeResult string

const (
	// MergeError is returned when the merge operation failed.
	MergeError MergeResult = "error"
	// MergeOK is returned when the merge operation succeeded.
	// This means the client save data is up-to-date and has been written.
	MergeOK MergeResult = "ok"
	// MergeConflict is returned when the merge operation failed because
	// the server save data is outdated. The client should update the server
	// save data.
	MergeConflict MergeResult = "conflict"
)

// MergeOKData is the data returned when the merge operation succeeded.
type MergeOKData struct {
	// Consistent is true if the client save data is consistent.
	// This means the client save data's last save hash matches the server save
	// data's hash.
	Consistent bool `json:"consistent"`
	// Hash is the hash of the client save data.
	Hash string `json:"hash"`
}

type MergeErrorData struct {
	Error string `json:"error"`
}

type MergeConflictData struct {
	Save       *SaveData `json:"save"`
	ServerHash string    `json:"server_hash,omitempty"`
}

type mergeResultData interface{ mergeResult() MergeResult }

func (MergeOKData) mergeResult() MergeResult       { return MergeOK }
func (MergeErrorData) mergeResult() MergeResult    { return MergeError }
func (MergeConflictData) mergeResult() MergeResult { return MergeConflict }

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

type saveDataRequest struct {
	SaveData
	LastHash string
}

func readSaveDataFromRequest(r *http.Request) (*saveDataRequest, error) {
	var data struct {
		Data     string  `json:"data"`
		LastHash *string `json:"last_hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decoding request body: %w", err)
	}

	req := &saveDataRequest{
		SaveData: SaveData{
			Data: data.Data,
			Date: time.Now().UnixMilli(),
		},
	}
	if data.LastHash != nil {
		req.LastHash = *data.LastHash
	}
	return req, nil
}

// SaveData describes the save data along with a pseudo-timestamp of the last
// user action.
type SaveData struct {
	Data string `json:"data"`
	Date int64  `json:"date"`
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
			return nil, nil
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

// Start implements extension.Extension.
func (e *autosyncExtension) Start(context.Context) error { return nil }

// Stop implements extension.Extension.
func (e *autosyncExtension) Stop() error { return nil }

// JSPath implements extension.ExtensionJSHookable.
func (e *autosyncExtension) JSPath() string { return "/autosync.js" }

func hashData(data *SaveData) string {
	if data == nil {
		return ""
	}

	hash := sha256.Sum256([]byte(data.Data))
	hash64 := base64.RawURLEncoding.EncodeToString(hash[:])
	return hash64
}

func stringMaxLen(str string, maxLen int) string {
	if len(str) > maxLen {
		return str[:maxLen]
	}
	return str
}
