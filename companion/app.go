package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const maxEvents = 3000

// Config は利用者が変えられる設定。
type Config struct {
	Token             string `json:"token"`
	GistID            string `json:"gistId"`
	LogsPath          string `json:"logsPath"`          // 空なら自動検出
	ScreenshotsPath   string `json:"screenshotsPath"`   // 空なら自動検出
	DeleteScreenshots bool   `json:"deleteScreenshots"` // 読み取ったスクショを消す
	Autostart         bool   `json:"autostart"`
	AutostartAsked    bool   `json:"autostartAsked"`
}

// State は再起動しても続きから読むための記録。
type State struct {
	Offsets map[string]int64        `json:"offsets"`
	Folders map[string]*folderState `json:"folders"`
	Events  []Event                 `json:"events"`
	Pos     *Position               `json:"position,omitempty"`
}

type App struct {
	mu       sync.Mutex
	dir      string
	cfg      Config
	st       State
	keys     map[string]bool
	curMap   string // 今いるマップ（ライブで読んだログから）
	curMapAt int64

	// 状態表示用
	logsPath    string
	shotsPath   string
	lastLogRead time.Time
	importing   bool
	pub         *Publisher
	fileGrowth  map[string]time.Time
	lastSize    map[string]int64
	dirty       bool
}

func NewApp(dir string) *App {
	a := &App{dir: dir, keys: map[string]bool{}, fileGrowth: map[string]time.Time{}, lastSize: map[string]int64{}}
	a.st = State{Offsets: map[string]int64{}, Folders: map[string]*folderState{}}
	readJSON(filepath.Join(dir, "config.json"), &a.cfg)
	readJSON(filepath.Join(dir, "state.json"), &a.st)
	if a.st.Offsets == nil {
		a.st.Offsets = map[string]int64{}
	}
	if a.st.Folders == nil {
		a.st.Folders = map[string]*folderState{}
	}
	for _, e := range a.st.Events {
		a.keys[e.Key()] = true
	}
	a.pub = NewPublisher(a)
	return a
}

func readJSON(path string, v any) {
	b, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(b, v)
	}
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", " ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (a *App) saveConfigLocked() {
	if err := writeJSON(filepath.Join(a.dir, "config.json"), a.cfg); err != nil {
		log.Println("config save:", err)
	}
}

func (a *App) saveStateLocked() {
	if err := writeJSON(filepath.Join(a.dir, "state.json"), a.st); err != nil {
		log.Println("state save:", err)
	}
}

// ── 連携コード ──
// アプリ（PWA）の設定画面に出る「TKS1-...」を貼ると、同期用の Gist に書き込めるようになる。

type pairPayload struct {
	T string `json:"t"`
	G string `json:"g"`
}

func decodePairCode(code string) (token, gist string, err error) {
	code = strings.TrimSpace(code)
	code = strings.TrimPrefix(code, "TKS1-")
	b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(code, "="))
	if err != nil {
		return "", "", errors.New("連携コードの形式が違います")
	}
	var p pairPayload
	if err := json.Unmarshal(b, &p); err != nil || p.T == "" || p.G == "" {
		return "", "", errors.New("連携コードの形式が違います")
	}
	return p.T, p.G, nil
}

// ── イベント追加 ──

func (a *App) addEvents(evs []Event, live bool) {
	if len(evs) == 0 {
		return
	}
	var added []Event
	a.mu.Lock()
	for _, e := range evs {
		if e.Type == "raidStarted" && e.RaidID != "" {
			dup := false
			for _, old := range a.st.Events {
				if old.Type == "raidStarted" && old.RaidID == e.RaidID {
					dup = true // 再接続などで同じレイドが2回出る
					break
				}
			}
			if dup {
				continue
			}
		}
		k := e.Key()
		if a.keys[k] {
			continue
		}
		a.keys[k] = true
		a.st.Events = append(a.st.Events, e)
		added = append(added, e)
		if e.Type == "raidStarted" && e.At >= a.curMapAt {
			a.curMap, a.curMapAt = e.Map, e.At
		}
	}
	if len(added) > 0 {
		sort.SliceStable(a.st.Events, func(i, j int) bool { return a.st.Events[i].At < a.st.Events[j].At })
		if len(a.st.Events) > maxEvents {
			drop := a.st.Events[:len(a.st.Events)-maxEvents]
			for _, e := range drop {
				delete(a.keys, e.Key())
			}
			a.st.Events = append([]Event(nil), a.st.Events[len(a.st.Events)-maxEvents:]...)
		}
		a.dirty = true
	}
	a.mu.Unlock()
	if len(added) > 0 {
		for _, e := range added {
			log.Printf("event %s %s%s%s", e.Type, e.TaskID, e.Map, e.ItemID)
		}
		a.pub.Changed(added, live)
	}
}

func (a *App) setPosition(p Position) {
	a.mu.Lock()
	if p.Map == "" && a.curMap != "" && time.Since(time.UnixMilli(a.curMapAt)) < 3*time.Hour {
		p.Map = a.curMap
	}
	a.st.Pos = &p
	a.dirty = true
	a.mu.Unlock()
	log.Printf("position %s %.1f %.1f yaw %.0f", p.Map, p.X, p.Z, p.Yaw)
	a.pub.Position(p)
}

// ── ログ監視 ──

func (a *App) resolveLogsPath() string {
	a.mu.Lock()
	custom := a.cfg.LogsPath
	a.mu.Unlock()
	if custom != "" {
		return custom
	}
	for _, p := range candidateLogPaths() {
		if fi, err := os.Stat(p); err == nil && fi.IsDir() {
			return p
		}
	}
	return ""
}

func (a *App) resolveShotsPath() string {
	a.mu.Lock()
	custom := a.cfg.ScreenshotsPath
	a.mu.Unlock()
	if custom != "" {
		return custom
	}
	return defaultScreenshotsPath()
}

// scanLogs は全ログフォルダを見て、増えた分だけ読む。初回は過去ログをすべて読む。
func (a *App) scanLogs() {
	lp := a.resolveLogsPath()
	a.mu.Lock()
	a.logsPath = lp
	a.mu.Unlock()
	if lp == "" {
		return
	}
	folders := listLogFolders(lp)
	for i, f := range folders {
		newest := i == len(folders)-1
		a.mu.Lock()
		fs := a.st.Folders[f.Path]
		if fs == nil {
			fs = &folderState{}
			a.st.Folders[f.Path] = fs
		}
		a.mu.Unlock()
		for _, file := range logFilesIn(f.Path) {
			a.readLogFile(file, fs, newest)
		}
	}
}

func (a *App) readLogFile(path string, fs *folderState, newest bool) {
	fi, err := os.Stat(path)
	if err != nil {
		return
	}
	a.mu.Lock()
	off := a.st.Offsets[path]
	a.mu.Unlock()
	size := fi.Size()
	if size < off {
		off = 0 // ファイルが作り直された
	}
	if size == off {
		return
	}
	now := time.Now()
	if a.lastSize[path] != size {
		a.lastSize[path] = size
		a.fileGrowth[path] = now
	}
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	if _, err := f.Seek(off, io.SeekStart); err != nil {
		return
	}
	buf, err := io.ReadAll(io.LimitReader(f, size-off))
	if err != nil {
		return
	}
	text := string(buf)
	// 最新フォルダで、書かれたばかりの最後の1件は次回まで待つ（JSONが途中かもしれない）
	complete := !newest || now.Sub(a.fileGrowth[path]) > 1500*time.Millisecond
	entries, consumed := splitEntries(text, complete)

	live := newest // 最新フォルダの分はすぐ送る（古すぎるものは Publisher 側で除く）
	var evs []Event
	for _, e := range entries {
		evs = append(evs, handleEntry(fs, e)...)
	}
	a.mu.Lock()
	a.st.Offsets[path] = off + int64(len(text[:consumed]))
	a.lastLogRead = now
	a.dirty = true
	a.mu.Unlock()
	a.addEvents(evs, live)
}

func (a *App) logLoop() {
	for {
		a.scanLogs()
		a.mu.Lock()
		if a.dirty {
			a.saveStateLocked()
			a.dirty = false
		}
		a.mu.Unlock()
		time.Sleep(2 * time.Second)
	}
}

// ── スクショ監視 ──

func (a *App) shotLoop() {
	seen := map[string]bool{}
	var watching string
	for {
		sp := a.resolveShotsPath()
		a.mu.Lock()
		a.shotsPath = sp
		del := a.cfg.DeleteScreenshots
		a.mu.Unlock()
		ents, err := os.ReadDir(sp)
		if err == nil {
			if watching != sp {
				// 監視を始めた時点で既にあるスクショは対象外
				seen = map[string]bool{}
				for _, d := range ents {
					seen[d.Name()] = true
				}
				watching = sp
			} else {
				for _, d := range ents {
					n := d.Name()
					if seen[n] || d.IsDir() {
						continue
					}
					seen[n] = true
					if p, ok := parseScreenshotName(n); ok {
						p.At = time.Now().UnixMilli()
						a.setPosition(p)
						if del {
							go func(path string) {
								time.Sleep(3 * time.Second) // ゲームが書き終わるのを待つ
								if err := os.Remove(path); err != nil {
									log.Println("screenshot delete:", err)
								}
							}(filepath.Join(sp, n))
						}
					}
				}
			}
		}
		time.Sleep(700 * time.Millisecond)
	}
}

// ── 状態表示 ──

type Status struct {
	Version     string    `json:"version"`
	Paired      bool      `json:"paired"`
	LogsPath    string    `json:"logsPath"`
	LogsFound   bool      `json:"logsFound"`
	ShotsPath   string    `json:"shotsPath"`
	ShotsFound  bool      `json:"shotsFound"`
	LastLogRead int64     `json:"lastLogRead"`
	Mode        string    `json:"mode"`
	CurMap      string    `json:"curMap"`
	Events      []Event   `json:"events"`
	EventCount  int       `json:"eventCount"`
	Position    *Position `json:"position"`
	Sync        PubStatus `json:"sync"`
	Config      Config    `json:"config"`
}

func (a *App) Status() Status {
	a.mu.Lock()
	defer a.mu.Unlock()
	recent := a.st.Events
	if len(recent) > 30 {
		recent = recent[len(recent)-30:]
	}
	rev := make([]Event, len(recent))
	for i, e := range recent {
		rev[len(recent)-1-i] = e
	}
	mode := ""
	// 最新フォルダのモード
	var newest string
	for p := range a.st.Folders {
		if p > newest {
			newest = p
		}
	}
	if fs := a.st.Folders[newest]; fs != nil {
		mode = fs.Mode
	}
	cfg := a.cfg
	cfg.Token = ""
	_, lerr := os.Stat(a.logsPath)
	_, serr := os.Stat(a.shotsPath)
	var last int64
	if !a.lastLogRead.IsZero() {
		last = a.lastLogRead.UnixMilli()
	}
	return Status{
		Version: version, Paired: a.cfg.Token != "" && a.cfg.GistID != "",
		LogsPath: a.logsPath, LogsFound: a.logsPath != "" && lerr == nil,
		ShotsPath: a.shotsPath, ShotsFound: serr == nil,
		LastLogRead: last, Mode: mode, CurMap: a.curMap,
		Events: rev, EventCount: len(a.st.Events), Position: a.st.Pos,
		Sync: a.pub.Status(), Config: cfg,
	}
}

func (a *App) snapshot() (events []Event, pos *Position) {
	a.mu.Lock()
	defer a.mu.Unlock()
	events = append([]Event(nil), a.st.Events...)
	if a.st.Pos != nil {
		p := *a.st.Pos
		pos = &p
	}
	return
}

func (a *App) creds() (token, gist string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.cfg.Token, a.cfg.GistID
}

// Rescan は過去ログを最初から読み直す。
func (a *App) Rescan() {
	a.mu.Lock()
	a.st.Offsets = map[string]int64{}
	a.st.Folders = map[string]*folderState{}
	a.dirty = true
	a.mu.Unlock()
	a.pub.Changed(nil, false)
}
