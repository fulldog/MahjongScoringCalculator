package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLookupPrefersDotEnv(t *testing.T) {
	t.Setenv("ADDR", ":9090")
	got := lookup(map[string]string{"ADDR": ":7070"}, "ADDR", ":8080")
	if got != ":7070" {
		t.Fatalf("got %s", got)
	}
}

func TestLookupUsesEnvWhenUnsetInFile(t *testing.T) {
	t.Setenv("ADDR", ":9090")
	got := lookup(map[string]string{}, "ADDR", ":8080")
	if got != ":9090" {
		t.Fatalf("got %s", got)
	}
}

func TestLookupUsesDefault(t *testing.T) {
	got := lookup(map[string]string{}, "MAHJONG_TEST_UNSET_KEY", "fallback")
	if got != "fallback" {
		t.Fatalf("got %s", got)
	}
}

func TestLookupEmptyFileValueWins(t *testing.T) {
	t.Setenv("WECHAT_APPID", "wx-real")
	got := lookup(map[string]string{"WECHAT_APPID": ""}, "WECHAT_APPID", "default")
	if got != "" {
		t.Fatalf("got %q", got)
	}
}

func TestLookupEmptyEnvBeatsDefault(t *testing.T) {
	t.Setenv("MAHJONG_TEST_EMPTY", "")
	got := lookup(map[string]string{}, "MAHJONG_TEST_EMPTY", "fallback")
	if got != "" {
		t.Fatalf("got %q", got)
	}
}

func TestParseDotEnv(t *testing.T) {
	src := `
# comment
ADDR=:7171
export JWT_SECRET="change-me"
WECHAT_APPID=
QUOTED='a=b'
`
	got, err := parseDotEnv(strings.NewReader(src))
	if err != nil {
		t.Fatal(err)
	}
	if got["ADDR"] != ":7171" || got["JWT_SECRET"] != "change-me" || got["WECHAT_APPID"] != "" || got["QUOTED"] != "a=b" {
		t.Fatalf("%v", got)
	}
}

func TestParseDotEnvRejectsMissingSeparator(t *testing.T) {
	_, err := parseDotEnv(strings.NewReader("NOT_A_PAIR\n"))
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestFindDotEnvAtModuleRoot(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "go.mod"), "module example\n")
	writeFile(t, filepath.Join(root, ".env"), "ADDR=:1\n")
	got, err := findDotEnv(filepath.Join(root, "internal", "config"))
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Join(root, ".env") {
		t.Fatalf("got %s", got)
	}
}

func TestFindDotEnvFromRepositoryRoot(t *testing.T) {
	repo := t.TempDir()
	writeFile(t, filepath.Join(repo, "server", "go.mod"), "module example\n")
	writeFile(t, filepath.Join(repo, "server", ".env"), "ADDR=:1\n")
	got, err := findDotEnv(repo)
	if err != nil {
		t.Fatal(err)
	}
	if got != filepath.Join(repo, "server", ".env") {
		t.Fatalf("got %s", got)
	}
}

func TestLoadPrefersModuleDotEnv(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "go.mod"), "module example\n")
	writeFile(t, filepath.Join(dir, ".env"), "ADDR=:7171\n")
	t.Setenv("ADDR", ":9090")

	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(wd); chdirErr != nil {
			t.Errorf("restore wd: %v", chdirErr)
		}
	})
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != ":7171" {
		t.Fatalf("addr %s", cfg.Addr)
	}
}

func writeFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
