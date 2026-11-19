package main

import (
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
)

var version = "0.1.0"

func main() {
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	dir := filepath.Join(base, "TarkovSupport")
	_ = os.MkdirAll(dir, 0o700)

	// ログはファイルへ（大きくなりすぎたら作り直す）
	logPath := filepath.Join(dir, "companion.log")
	if fi, err := os.Stat(logPath); err == nil && fi.Size() > 2<<20 {
		_ = os.Rename(logPath, logPath+".old")
	}
	if lf, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
		log.SetOutput(io.MultiWriter(lf, os.Stderr))
	}

	url := "http://" + listenAddr + "/"
	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		// もう起動している → 画面だけ開いて終わる
		openBrowser(url)
		return
	}
	log.Println("start", version)

	app := NewApp(dir)
	firstRun := !app.cfg.AutostartAsked
	if firstRun && autostartSupported() {
		app.cfg.Autostart, app.cfg.AutostartAsked = true, true
		if err := setAutostart(true); err != nil {
			log.Println("autostart:", err)
		}
		app.saveConfigLocked()
	}

	go func() {
		if err := http.Serve(ln, app.handler()); err != nil {
			log.Fatal(err)
		}
	}()
	go app.pub.Loop()
	go app.logLoop()
	go app.shotLoop()

	if tok, _ := app.creds(); tok == "" || firstRun {
		openBrowser(url)
	}
	runUI(url) // Windows ではタスクトレイ。終了メニューで戻る
}
