package config

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Config is process configuration.
// A key in the server-root .env wins over the process environment, which wins over the built-in default.
type Config struct {
	Addr          string
	MySQLDSN      string
	JWTSecret     string
	WeChatAppID   string
	WeChatSecret  string
	AdminUser     string
	AdminPassword string
	AdminOrigin   string
	LogDir        string
	LogMaxAgeDays int
	DotenvPath    string
}

// Load reads .env from the server module root, then fills any missing keys from the environment and defaults.
// A missing .env file is ignored. An explicit empty value in .env still overrides the environment.
func Load() (Config, error) {
	wd, err := os.Getwd()
	if err != nil {
		return Config{}, fmt.Errorf("working directory: %w", err)
	}
	file, path, err := readDotEnv(wd)
	if err != nil {
		return Config{}, err
	}
	if path == "" {
		file, path, err = dotEnvBesideExecutable()
		if err != nil {
			return Config{}, err
		}
	}
	logDays, err := lookupInt(file, "LOG_MAX_AGE_DAYS", 30)
	if err != nil {
		return Config{}, err
	}
	logDir := lookup(file, "LOG_DIR", "logs")
	if logDir == "" {
		logDir = "logs"
	}
	cfg := Config{
		Addr:          lookup(file, "ADDR", ":8080"),
		MySQLDSN:      lookup(file, "MYSQL_DSN", "root:mahjong@tcp(127.0.0.1:3306)/mahjong?parseTime=true&charset=utf8mb4&loc=Local"),
		JWTSecret:     lookup(file, "JWT_SECRET", "dev-secret-change-me"),
		WeChatAppID:   lookup(file, "WECHAT_APPID", ""),
		WeChatSecret:  lookup(file, "WECHAT_SECRET", ""),
		AdminUser:     lookup(file, "ADMIN_USERNAME", "admin"),
		AdminPassword: lookup(file, "ADMIN_PASSWORD", "admin123"),
		AdminOrigin:   lookup(file, "ADMIN_ORIGIN", "http://localhost:5173"),
		LogDir:        logDir,
		LogMaxAgeDays: logDays,
		DotenvPath:    path,
	}
	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is empty")
	}
	if cfg.MySQLDSN == "" {
		return Config{}, fmt.Errorf("MYSQL_DSN is empty")
	}
	return cfg, nil
}

func lookupInt(file map[string]string, key string, fallback int) (int, error) {
	raw := lookup(file, key, "")
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("%s is invalid", key)
	}
	return n, nil
}

func lookup(file map[string]string, key, fallback string) string {
	if value, ok := file[key]; ok {
		return value
	}
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

// readDotEnv finds .env beside go.mod, or in ./server when the process is started from the repository root.
func readDotEnv(start string) (map[string]string, string, error) {
	path, err := findDotEnv(start)
	if err != nil {
		return nil, "", err
	}
	if path == "" {
		return map[string]string{}, "", nil
	}
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]string{}, "", nil
		}
		return nil, "", fmt.Errorf("open dotenv: %w", err)
	}
	defer f.Close()
	vals, err := parseDotEnv(f)
	if err != nil {
		return nil, "", err
	}
	return vals, path, nil
}

func findDotEnv(start string) (string, error) {
	dir := start
	for {
		if fileExists(filepath.Join(dir, "go.mod")) {
			envPath := filepath.Join(dir, ".env")
			if fileExists(envPath) {
				return envPath, nil
			}
			return "", nil
		}
		serverMod := filepath.Join(dir, "server", "go.mod")
		if fileExists(serverMod) {
			envPath := filepath.Join(dir, "server", ".env")
			if fileExists(envPath) {
				return envPath, nil
			}
			return "", nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", nil
		}
		dir = parent
	}
}

func dotEnvBesideExecutable() (map[string]string, string, error) {
	exe, err := os.Executable()
	if err != nil {
		return map[string]string{}, "", nil
	}
	path := filepath.Join(filepath.Dir(exe), ".env")
	if !fileExists(path) {
		return map[string]string{}, "", nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, "", fmt.Errorf("open dotenv: %w", err)
	}
	defer f.Close()
	vals, err := parseDotEnv(f)
	if err != nil {
		return nil, "", err
	}
	return vals, path, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func parseDotEnv(r io.Reader) (map[string]string, error) {
	sc := bufio.NewScanner(r)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 1024*1024)
	out := make(map[string]string)
	lineNo := 0
	for sc.Scan() {
		lineNo++
		line := strings.TrimSpace(sc.Text())
		if lineNo == 1 {
			line = strings.TrimPrefix(line, "\uFEFF")
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("dotenv line %d: missing '='", lineNo)
		}
		key = strings.TrimSpace(key)
		if key == "" || strings.ContainsAny(key, " \t") {
			return nil, fmt.Errorf("dotenv line %d: invalid key", lineNo)
		}
		val = strings.TrimSpace(val)
		if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
			parsed, err := strconv.Unquote(val)
			if err != nil {
				return nil, fmt.Errorf("dotenv line %d: %w", lineNo, err)
			}
			val = parsed
		} else if len(val) >= 2 && val[0] == '\'' && val[len(val)-1] == '\'' {
			val = val[1 : len(val)-1]
		}
		out[key] = val
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("dotenv: %w", err)
	}
	return out, nil
}
