package logx

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestOpenWritesDatedInfoFile(t *testing.T) {
	dir := t.TempDir()
	logs, err := Open(dir, 7*24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	logs.Info.Info("hello", zap.String("k", "v"))
	if err := logs.Close(); err != nil {
		t.Fatal(err)
	}
	name := "info-" + time.Now().Format("20060102") + ".log"
	body, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), `"msg":"hello"`) {
		t.Fatalf("body %s", body)
	}
}
