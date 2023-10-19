package extension

import (
	"context"
	"log/slog"
)

type ctxKey uint8

const (
	ctxKeyExtension ctxKey = iota
	ctxKeySlog
)

// ExtensionFromContext returns the extension ID from the context.
func ExtensionFromContext(ctx context.Context) string {
	return ctx.Value(ctxKeyExtension).(string)
}

// LoggerFromContext returns the slog.Logger from the context.
// If no logger is present, it returns slog.Default.
func LoggerFromContext(ctx context.Context) *slog.Logger {
	logger, ok := ctx.Value(ctxKeySlog).(*slog.Logger)
	if !ok {
		return slog.Default()
	}
	return logger
}
