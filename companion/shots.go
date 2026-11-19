package main

// スクリーンショットのファイル名から現在地と向きを読む。
// 例: 2024-07-01[12-34]_123.45, 6.78, -90.12_0.01234, -0.6789, 0.01234, 0.7123_12.34 (0).png

import (
	"math"
	"regexp"
	"strconv"
)

type Position struct {
	Map  string  `json:"map,omitempty"` // ログで分かった今のマップ（tarkov.dev の nameId）
	X    float64 `json:"x"`
	Y    float64 `json:"y"` // 高さ
	Z    float64 `json:"z"`
	Yaw  float64 `json:"yaw"` // 向き（度）
	At   int64   `json:"at"`
	File string  `json:"file,omitempty"`
}

var reShot = regexp.MustCompile(`\d{4}-\d{2}-\d{2}\[\d{2}-\d{2}\]_?` +
	`(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)_?` +
	`(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)`)

var reImage = regexp.MustCompile(`(?i)\.(png|jpe?g|bmp)$`)

func parseScreenshotName(name string) (Position, bool) {
	if !reImage.MatchString(name) {
		return Position{}, false
	}
	m := reShot.FindStringSubmatch(name)
	if m == nil {
		return Position{}, false
	}
	f := make([]float64, 7)
	for i := range f {
		v, err := strconv.ParseFloat(m[i+1], 64)
		if err != nil {
			return Position{}, false
		}
		f[i] = v
	}
	return Position{X: f[0], Y: f[1], Z: f[2], Yaw: quaternionYaw(f[3], f[4], f[5], f[6]), File: name}, true
}

// quaternionYaw は tarkov.dev / TarkovMonitor と同じ計算で向き（度）を出す。
func quaternionYaw(qx, qy, qz, qw float64) float64 {
	siny := 2 * (qw*qy + qx*qz)
	cosy := 1 - 2*(qz*qz+qy*qy)
	yaw := math.Atan2(siny, cosy) * 180 / math.Pi
	return math.Round(yaw*10) / 10
}
