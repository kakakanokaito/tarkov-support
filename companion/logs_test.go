package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// 実際のログの形を模したサンプル（TarkovMonitor が読んでいる形式に合わせた）
const sampleApp = "2025-01-10 20:00:01.123 +09:00|0.16.0.2.34510|Info|application|Session mode: Regular\r\n" +
	"2025-01-10 20:01:00.000 +09:00|0.16.0.2.34510|Info|application|SelectProfile ProfileId:abc AccountId:123\r\n" +
	"2025-01-10 20:05:10.500 +09:00|0.16.0.2.34510|Info|application|TRACE-NetworkGameCreate profileStatus: 'Profileid: abc, Status: Busy, RaidMode: Online, Ip: 1.2.3.4, Port: 17000, Location: bigmap, Sid: x, GameMode: deathmatch, shortId: AB12CD'\r\n"

const sampleNotif = `2025-01-10 20:02:00.000 +09:00|0.16.0.2.34510|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "eventId": "1",
  "message": {
    "_id": "m1",
    "type": 10,
    "templateId": "5936d90786f7742b1420ba5b description 5936d90786f7742b1420ba5b",
    "hasRewards": false
  }
}
2025-01-10 20:30:00.000 +09:00|0.16.0.2.34510|Info|push-notifications|Got notification | ChatMessageReceived
{
  "message": {
    "type": 12,
    "templateId": "5936d90786f7742b1420ba5b successMessageText 5936d90786f7742b1420ba5b"
  }
}
2025-01-10 20:40:00.000 +09:00|0.16.0.2.34510|Info|push-notifications|Got notification | ChatMessageReceived
{
  "message": {
    "type": 4,
    "templateId": "5bdabfb886f7743e152e867e 0",
    "systemData": { "buyerNickname": "x", "soldItem": "57347ca924597744596b4e71", "itemCount": 2 },
    "items": { "data": [
      { "_id": "a", "_tpl": "5449016a4bdc2d6f028b456f", "upd": { "StackObjectsCount": 500000 } },
      { "_id": "b", "_tpl": "5449016a4bdc2d6f028b456f", "upd": { "StackObjectsCount": 120000 } }
    ] }
  }
}
2025-01-10 20:41:00.000 +09:00|0.16.0.2.34510|Info|push-notifications|Got notification | ChatMessageReceived
{
  "message": { "type": 1, "text": "hi" }
}
`

func TestParse(t *testing.T) {
	fs := &folderState{}
	var evs []Event
	for _, txt := range []string{sampleApp, sampleNotif} {
		entries, _ := splitEntries(txt, true)
		for _, e := range entries {
			evs = append(evs, handleEntry(fs, e)...)
		}
	}
	if fs.Mode != "regular" {
		t.Fatalf("mode = %q", fs.Mode)
	}
	want := []string{"raidStarted", "taskStarted", "taskCompleted", "fleaSold"}
	if len(evs) != len(want) {
		t.Fatalf("got %d events: %+v", len(evs), evs)
	}
	for i, w := range want {
		if evs[i].Type != w {
			t.Errorf("%d: %s want %s", i, evs[i].Type, w)
		}
	}
	if evs[0].Map != "bigmap" || evs[0].RaidID != "AB12CD" {
		t.Errorf("raid %+v", evs[0])
	}
	if evs[1].TaskID != "5936d90786f7742b1420ba5b" {
		t.Errorf("task %+v", evs[1])
	}
	if evs[3].PriceRUB != 620000 || evs[3].Count != 2 || evs[3].ItemID != "57347ca924597744596b4e71" {
		t.Errorf("flea %+v", evs[3])
	}
	want0 := time.Date(2025, 1, 10, 11, 5, 10, 500e6, time.UTC)
	if !time.UnixMilli(evs[0].At).Equal(want0) {
		t.Errorf("time %v", time.UnixMilli(evs[0].At).UTC())
	}
}

func TestPvEIgnored(t *testing.T) {
	fs := &folderState{}
	txt := strings.Replace(sampleApp, "Regular", "Pve", 1)
	entries, _ := splitEntries(txt+sampleNotif, true)
	var evs []Event
	for _, e := range entries {
		evs = append(evs, handleEntry(fs, e)...)
	}
	if len(evs) != 0 {
		t.Fatalf("PvE should be ignored, got %+v", evs)
	}
}

func TestPartialEntry(t *testing.T) {
	cut := strings.Index(sampleNotif, "2025-01-10 20:30")
	partial := sampleNotif[:cut+40] // 2件目の途中まで
	entries, consumed := splitEntries(partial, false)
	if len(entries) != 1 || consumed != cut {
		t.Fatalf("entries %d consumed %d cut %d", len(entries), consumed, cut)
	}
}

func TestScreenshot(t *testing.T) {
	p, ok := parseScreenshotName("2025-01-10[20-15]_123.45, 6.78, -90.12_0.00000, 0.70711, 0.00000, 0.70711_12.34 (0).png")
	if !ok {
		t.Fatal("not parsed")
	}
	if p.X != 123.45 || p.Y != 6.78 || p.Z != -90.12 || p.Yaw != 90 {
		t.Fatalf("%+v", p)
	}
	if _, ok := parseScreenshotName("2025-01-10[20-15]_normal screenshot.png"); ok {
		t.Fatal("should not parse")
	}
}

func TestEndToEnd(t *testing.T) {
	dir := t.TempDir()
	logs := filepath.Join(dir, "Logs")
	f1 := filepath.Join(logs, "log_2025.01.10_19-59-58_0.16.0.2.34510")
	os.MkdirAll(f1, 0o755)
	os.WriteFile(filepath.Join(f1, "2025.01.10_19-59-58_0.16.0.2.34510 application_000.log"), []byte(sampleApp), 0o644)
	os.WriteFile(filepath.Join(f1, "2025.01.10_19-59-58_0.16.0.2.34510 notifications_000.log"), []byte(sampleNotif), 0o644)
	a := NewApp(dir)
	a.cfg.LogsPath = logs
	a.scanLogs()
	// 最新フォルダの最後の1件は書き込み途中扱いで保留される
	time.Sleep(10 * time.Millisecond)
	for k := range a.fileGrowth {
		a.fileGrowth[k] = time.Now().Add(-time.Minute)
	}
	a.scanLogs()
	if n := len(a.st.Events); n != 4 {
		t.Fatalf("events = %d %+v", n, a.st.Events)
	}
	// 2回目は増えない
	a.scanLogs()
	if n := len(a.st.Events); n != 4 {
		t.Fatalf("dup events = %d", n)
	}
	if a.curMap != "bigmap" {
		t.Fatalf("curMap %q", a.curMap)
	}
}
