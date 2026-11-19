//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// 開発用（Mac/Linux）。本番は Windows。
func candidateLogPaths() []string {
	if p := os.Getenv("TKS_LOGS"); p != "" {
		return []string{p}
	}
	return nil
}

func defaultScreenshotsPath() string {
	if p := os.Getenv("TKS_SHOTS"); p != "" {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Documents", "Escape from Tarkov", "Screenshots")
}

func autostartSupported() bool   { return false }
func setAutostart(on bool) error { return nil }

func openBrowser(url string) {
	if os.Getenv("TKS_NO_BROWSER") != "" {
		return
	}
	cmd := "xdg-open"
	if runtime.GOOS == "darwin" {
		cmd = "open"
	}
	_ = exec.Command(cmd, url).Start()
}

func runUI(url string) { select {} }
