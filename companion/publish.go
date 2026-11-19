package main

// アプリへの送り方は2つ。
// ・Gist（同期用の非公開Gist）に companion ファイルとして全イベントと現在地を書く → 確実に届く（後から開いても反映）
// ・ntfy.sh（中継サービス）にすぐ流す → iPad で開いていれば1秒以内に届く
// ntfy のトピック名はトークンとGist IDから作るハッシュで、他人には推測できない。

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

const (
	companionFile = "tarkov-support-companion.json"
	ntfyBase      = "https://ntfy.sh/"
)

var httpc = &http.Client{Timeout: 20 * time.Second}

type PubStatus struct {
	GistOK    int64  `json:"gistOk"`
	GistError string `json:"gistError"`
	LiveOK    int64  `json:"liveOk"`
	LiveError string `json:"liveError"`
}

type Publisher struct {
	app     *App
	mu      sync.Mutex
	st      PubStatus
	kick    chan struct{}
	pending bool
}

func NewPublisher(a *App) *Publisher {
	return &Publisher{app: a, kick: make(chan struct{}, 1)}
}

func (p *Publisher) Status() PubStatus {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.st
}

func liveTopic(token, gist string) string {
	h := sha256.Sum256([]byte("tarkov-support:" + gist + ":" + token))
	return "tks-" + hex.EncodeToString(h[:])[:24]
}

// Changed は新しいイベントがあった時に呼ぶ。live なら ntfy にもすぐ流す。
func (p *Publisher) Changed(added []Event, live bool) {
	if live {
		// 起動直後に読んだ古い記録は即時連絡しない（Gist で届く）
		cut := time.Now().Add(-15 * time.Minute).UnixMilli()
		var recent []Event
		for _, e := range added {
			if e.At >= cut {
				recent = append(recent, e)
			}
		}
		for i := 0; i < len(recent); i += 20 {
			j := min(i+20, len(recent))
			go p.sendLive(map[string]any{"k": "ev", "events": recent[i:j]})
		}
	}
	p.mu.Lock()
	p.pending = true
	p.mu.Unlock()
	select {
	case p.kick <- struct{}{}:
	default:
	}
}

func (p *Publisher) Position(pos Position) {
	go p.sendLive(map[string]any{"k": "pos", "pos": pos})
	p.Changed(nil, false)
}

func (p *Publisher) sendLive(msg any) {
	token, gist := p.app.creds()
	if token == "" || gist == "" {
		return
	}
	b, _ := json.Marshal(msg)
	req, _ := http.NewRequest("POST", ntfyBase+liveTopic(token, gist), bytes.NewReader(b))
	req.Header.Set("User-Agent", "tarkov-support-companion")
	res, err := httpc.Do(req)
	p.mu.Lock()
	defer p.mu.Unlock()
	if err != nil {
		p.st.LiveError = "中継サーバーに届きません"
		return
	}
	res.Body.Close()
	if res.StatusCode >= 300 {
		p.st.LiveError = fmt.Sprintf("中継サーバー: HTTP %d", res.StatusCode)
		return
	}
	p.st.LiveOK, p.st.LiveError = time.Now().UnixMilli(), ""
}

// Loop は Gist への書き込みをまとめて行う（変化から3秒待ってから1回）。
func (p *Publisher) Loop() {
	backoff := 5 * time.Second
	for range p.kick {
		time.Sleep(3 * time.Second)
		for {
			p.mu.Lock()
			if !p.pending {
				p.mu.Unlock()
				break
			}
			p.pending = false
			p.mu.Unlock()
			if err := p.pushGist(); err != nil {
				log.Println("gist:", err)
				p.mu.Lock()
				p.st.GistError = err.Error()
				p.pending = true
				p.mu.Unlock()
				time.Sleep(backoff)
				if backoff < 5*time.Minute {
					backoff *= 2
				}
				continue
			}
			backoff = 5 * time.Second
			p.mu.Lock()
			p.st.GistOK, p.st.GistError = time.Now().UnixMilli(), ""
			p.mu.Unlock()
		}
	}
}

func (p *Publisher) pushGist() error {
	token, gist := p.app.creds()
	if token == "" || gist == "" {
		return nil
	}
	events, pos := p.app.snapshot()
	content, _ := json.Marshal(map[string]any{
		"v": 1, "version": version, "updatedAt": time.Now().UnixMilli(),
		"events": events, "position": pos,
	})
	body, _ := json.Marshal(map[string]any{
		"files": map[string]any{companionFile: map[string]string{"content": string(content)}},
	})
	req, _ := http.NewRequest("PATCH", "https://api.github.com/gists/"+gist, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "tarkov-support-companion")
	res, err := httpc.Do(req)
	if err != nil {
		return fmt.Errorf("GitHub に届きません")
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == 401:
		return fmt.Errorf("トークンが無効です。アプリで連携コードを出し直してください")
	case res.StatusCode == 403 || res.StatusCode == 404:
		return fmt.Errorf("Gist に書き込めません（HTTP %d）", res.StatusCode)
	case res.StatusCode >= 300:
		return fmt.Errorf("GitHub エラー: HTTP %d", res.StatusCode)
	}
	return nil
}
