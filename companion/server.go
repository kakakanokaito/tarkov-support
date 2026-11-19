package main

// 設定と状態を見るための小さな画面（このPCのブラウザだけで開ける: http://127.0.0.1:47321）

import (
	_ "embed"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"
)

const listenAddr = "127.0.0.1:47321"

//go:embed web/index.html
var indexHTML []byte

func (a *App) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(indexHTML)
	})
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSONResp(w, a.Status())
	})
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct {
			PairCode          *string `json:"pairCode"`
			Unpair            bool    `json:"unpair"`
			LogsPath          *string `json:"logsPath"`
			ScreenshotsPath   *string `json:"screenshotsPath"`
			DeleteScreenshots *bool   `json:"deleteScreenshots"`
			Autostart         *bool   `json:"autostart"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			http.Error(w, "bad json", 400)
			return
		}
		if in.PairCode != nil {
			t, g, err := decodePairCode(*in.PairCode)
			if err != nil {
				writeJSONResp(w, map[string]string{"error": err.Error()})
				return
			}
			a.mu.Lock()
			a.cfg.Token, a.cfg.GistID = t, g
			a.mu.Unlock()
			a.pub.Changed(nil, false) // 今までのイベントをすぐ送る
		}
		a.mu.Lock()
		if in.Unpair {
			a.cfg.Token, a.cfg.GistID = "", ""
		}
		if in.LogsPath != nil {
			a.cfg.LogsPath = strings.TrimSpace(*in.LogsPath)
		}
		if in.ScreenshotsPath != nil {
			a.cfg.ScreenshotsPath = strings.TrimSpace(*in.ScreenshotsPath)
		}
		if in.DeleteScreenshots != nil {
			a.cfg.DeleteScreenshots = *in.DeleteScreenshots
		}
		if in.Autostart != nil {
			a.cfg.Autostart = *in.Autostart
			a.cfg.AutostartAsked = true
		}
		auto := a.cfg.Autostart
		a.saveConfigLocked()
		a.mu.Unlock()
		if in.Autostart != nil {
			if err := setAutostart(auto); err != nil {
				writeJSONResp(w, map[string]string{"error": "自動起動の設定に失敗: " + err.Error()})
				return
			}
		}
		writeJSONResp(w, map[string]string{"ok": "1"})
	})
	mux.HandleFunc("/api/rescan", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		a.Rescan()
		writeJSONResp(w, map[string]string{"ok": "1"})
	})
	mux.HandleFunc("/api/test", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		// iPad に届くかの確認用。カスタムの中央付近の仮の位置を送る
		a.setPosition(Position{Map: "bigmap", X: 0, Y: 0, Z: 0, Yaw: float64(time.Now().Second() * 6), At: time.Now().UnixMilli(), File: "テスト送信"})
		writeJSONResp(w, map[string]string{"ok": "1"})
	})
	return guard(mux)
}

// guard はこのPCのブラウザ以外（他サイトからの書き込みなど）を断る。
func guard(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.Host)
		if host != "127.0.0.1" && host != "localhost" {
			http.Error(w, "forbidden", 403)
			return
		}
		if r.Method != http.MethodGet && r.Header.Get("X-TKS") != "1" {
			http.Error(w, "forbidden", 403)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func writeJSONResp(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}
