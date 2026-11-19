package main

// ゲームのログ（Logs/log_日時_バージョン/ 内の application / notifications）を読み、
// タスクの受注・完了・失敗、レイド開始（マップ名）、フリマ売却を取り出す。
// ファイルを読むだけで、ゲームには一切触れない。

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Event はアプリ（PWA）側の ProgressEvent と同じ形。
type Event struct {
	Type     string `json:"type"`
	TaskID   string `json:"taskId,omitempty"`
	Map      string `json:"map,omitempty"`
	RaidID   string `json:"raidId,omitempty"`
	ItemID   string `json:"itemId,omitempty"`
	Count    int    `json:"count,omitempty"`
	PriceRUB int    `json:"priceRUB,omitempty"`
	At       int64  `json:"at"` // ミリ秒
}

func (e Event) Key() string {
	return e.Type + "|" + e.TaskID + "|" + e.RaidID + "|" + e.ItemID + "|" + itoa64(e.At)
}

const (
	roubleTpl        = "5449016a4bdc2d6f028b456f"
	fleaSoldTemplate = "5bdabfb886f7743e152e867e 0"
)

var (
	reHeader    = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})( [+-]\d{2}:\d{2})?\|(.*)$`)
	reFolder    = regexp.MustCompile(`log_(\d{4})\.(\d{2})\.(\d{2})_(\d{1,2})-(\d{2})-(\d{2})`)
	reLogFile   = regexp.MustCompile(`(?i)(application|notifications)(_\d+)?\.log$`)
	reMode      = regexp.MustCompile(`Session mode: ([^\s|]+)`)
	reLocation  = regexp.MustCompile(`Location: ([^,]+)`)
	reShortID   = regexp.MustCompile(`shortId: ([A-Za-z0-9]+)`)
	reCompactWS = regexp.MustCompile(`\s+`)
)

// LogEntry は1件のログ（1行目＋続くJSON）。
type LogEntry struct {
	At     time.Time
	Header string
	Body   string
}

// splitEntries はテキストをログ1件ずつに分ける。
// complete=false のときは最後の1件を「書きかけかもしれない」として返さず、その開始位置を返す。
func splitEntries(text string, complete bool) (entries []LogEntry, consumed int) {
	type start struct {
		pos  int
		line string
	}
	var starts []start
	pos := 0
	for pos < len(text) {
		end := strings.IndexByte(text[pos:], '\n')
		var line string
		next := len(text)
		if end >= 0 {
			line = text[pos : pos+end]
			next = pos + end + 1
		} else {
			line = text[pos:]
		}
		if reHeader.MatchString(strings.TrimRight(line, "\r")) {
			starts = append(starts, start{pos, strings.TrimRight(line, "\r")})
		}
		pos = next
	}
	if len(starts) == 0 {
		if complete {
			return nil, len(text)
		}
		return nil, 0
	}
	n := len(starts)
	limit := n
	if !complete {
		limit = n - 1
	}
	for i := 0; i < limit; i++ {
		endPos := len(text)
		if i+1 < n {
			endPos = starts[i+1].pos
		}
		m := reHeader.FindStringSubmatch(starts[i].line)
		bodyStart := starts[i].pos + len(starts[i].line)
		body := ""
		if bodyStart < endPos {
			body = strings.TrimSpace(text[bodyStart:endPos])
		}
		entries = append(entries, LogEntry{At: parseLogTime(m[1], m[2], m[3]), Header: m[4], Body: body})
	}
	if complete {
		return entries, len(text)
	}
	return entries, starts[n-1].pos
}

func parseLogTime(date, clock, offset string) time.Time {
	if offset != "" {
		if t, err := time.Parse("2006-01-02 15:04:05.000 -07:00", date+" "+clock+offset); err == nil {
			return t
		}
	}
	t, err := time.ParseInLocation("2006-01-02 15:04:05.000", date+" "+clock, time.Local)
	if err != nil {
		return time.Now()
	}
	return t
}

// folderState は1つのログフォルダ（＝ゲーム1回の起動）の状態。
type folderState struct {
	Mode string `json:"mode"` // regular / pve / pvpseason など（小文字）
}

func (f *folderState) isPvE() bool { return f.Mode == "pve" }

// handleEntry は1件のログを解釈してイベントを返す。
func handleEntry(fs *folderState, e LogEntry) []Event {
	h := e.Header
	at := e.At.UnixMilli()

	if m := reMode.FindStringSubmatch(h); m != nil {
		fs.Mode = strings.ToLower(m[1])
		return nil
	}
	if fs.isPvE() {
		return nil // PvE のプロフィールは対象外（PvP の進捗だけを扱う）
	}

	if strings.Contains(h, "TRACE-NetworkGameCreate profileStatus") {
		loc := reLocation.FindStringSubmatch(h)
		if loc == nil {
			return nil
		}
		ev := Event{Type: "raidStarted", Map: strings.TrimSpace(loc[1]), At: at}
		if id := reShortID.FindStringSubmatch(h); id != nil {
			ev.RaidID = id[1]
		}
		return []Event{ev}
	}

	if strings.Contains(h, "Got notification | ChatMessageReceived") {
		return parseChatMessage(e.Body, at)
	}
	return nil
}

type chatMsg struct {
	Message struct {
		Type       int    `json:"type"`
		TemplateID string `json:"templateId"`
		SystemData *struct {
			SoldItem  string `json:"soldItem"`
			ItemCount int    `json:"itemCount"`
		} `json:"systemData"`
		Items *struct {
			Data []struct {
				Tpl string `json:"_tpl"`
				Upd *struct {
					StackObjectsCount *float64 `json:"StackObjectsCount"`
				} `json:"upd"`
			} `json:"data"`
		} `json:"items"`
	} `json:"message"`
}

func parseChatMessage(body string, at int64) []Event {
	i := strings.IndexByte(body, '{')
	j := strings.LastIndexByte(body, '}')
	if i < 0 || j <= i {
		return nil
	}
	var m chatMsg
	if err := json.Unmarshal([]byte(body[i:j+1]), &m); err != nil {
		return nil
	}
	msg := m.Message
	switch msg.Type {
	case 10, 11, 12:
		id := strings.Fields(msg.TemplateID)
		if len(id) == 0 {
			return nil
		}
		t := map[int]string{10: "taskStarted", 11: "taskFailed", 12: "taskCompleted"}[msg.Type]
		return []Event{{Type: t, TaskID: id[0], At: at}}
	case 4:
		if msg.TemplateID != fleaSoldTemplate || msg.SystemData == nil {
			return nil
		}
		price := 0
		if msg.Items != nil {
			for _, it := range msg.Items.Data {
				if it.Tpl != roubleTpl {
					continue
				}
				n := 1.0
				if it.Upd != nil && it.Upd.StackObjectsCount != nil {
					n = *it.Upd.StackObjectsCount
				}
				price += int(n)
			}
		}
		count := msg.SystemData.ItemCount
		if count == 0 {
			count = 1
		}
		return []Event{{Type: "fleaSold", ItemID: msg.SystemData.SoldItem, Count: count, PriceRUB: price, At: at}}
	}
	return nil
}

// ── フォルダ・ファイルの発見 ──

type logFolder struct {
	Path string
	Time time.Time
}

func listLogFolders(logsPath string) []logFolder {
	ents, err := os.ReadDir(logsPath)
	if err != nil {
		return nil
	}
	var out []logFolder
	for _, d := range ents {
		if !d.IsDir() {
			continue
		}
		m := reFolder.FindStringSubmatch(d.Name())
		if m == nil {
			continue
		}
		t, err := time.ParseInLocation("2006.01.02_15-04-05",
			m[1]+"."+m[2]+"."+m[3]+"_"+pad2(m[4])+"-"+m[5]+"-"+m[6], time.Local)
		if err != nil {
			continue
		}
		out = append(out, logFolder{Path: filepath.Join(logsPath, d.Name()), Time: t})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Time.Before(out[j].Time) })
	return out
}

// logFilesIn は application → notifications の順でファイルを返す（モード判定を先に読むため）。
func logFilesIn(folder string) []string {
	ents, err := os.ReadDir(folder)
	if err != nil {
		return nil
	}
	var app, notif []string
	for _, d := range ents {
		if d.IsDir() {
			continue
		}
		m := reLogFile.FindStringSubmatch(d.Name())
		if m == nil {
			continue
		}
		p := filepath.Join(folder, d.Name())
		if strings.EqualFold(m[1], "application") {
			app = append(app, p)
		} else {
			notif = append(notif, p)
		}
	}
	sort.Strings(app)
	sort.Strings(notif)
	return append(app, notif...)
}

func pad2(s string) string {
	if len(s) == 1 {
		return "0" + s
	}
	return s
}

func itoa64(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}
