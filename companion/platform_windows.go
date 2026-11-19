//go:build windows

package main

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"fyne.io/systray"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

//go:embed icon.ico
var trayIcon []byte

var uninstallKeys = []string{
	`SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\EscapeFromTarkov`,
	`SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\EscapeFromTarkov`,
	`SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 3932890`,
	`SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 3932890`,
}

// candidateLogPaths はゲームの Logs フォルダの候補（インストール先をレジストリから探す）。
func candidateLogPaths() []string {
	var installs []string
	for _, root := range []registry.Key{registry.LOCAL_MACHINE, registry.CURRENT_USER} {
		for _, k := range uninstallKeys {
			key, err := registry.OpenKey(root, k, registry.QUERY_VALUE)
			if err != nil {
				continue
			}
			if v, _, err := key.GetStringValue("InstallLocation"); err == nil && v != "" {
				installs = append(installs, v)
			}
			key.Close()
		}
	}
	installs = append(installs, steamInstalls()...)
	installs = append(installs,
		`C:\Battlestate Games\EFT`,
		`C:\Battlestate Games\Escape from Tarkov`,
		`C:\Program Files (x86)\Steam\steamapps\common\Escape from Tarkov`,
	)
	var out []string
	for _, p := range installs {
		out = append(out, filepath.Join(p, "Logs"), filepath.Join(p, "build", "Logs"))
	}
	return out
}

var reVdfPath = regexp.MustCompile(`"path"\s+"([^"]+)"`)

func steamInstalls() []string {
	var steam string
	if key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Valve\Steam`, registry.QUERY_VALUE); err == nil {
		steam, _, _ = key.GetStringValue("SteamPath")
		key.Close()
	}
	if steam == "" {
		return nil
	}
	b, err := os.ReadFile(filepath.Join(steam, "steamapps", "libraryfolders.vdf"))
	if err != nil {
		return nil
	}
	var out []string
	for _, m := range reVdfPath.FindAllStringSubmatch(string(b), -1) {
		lib := strings.ReplaceAll(m[1], `\\`, `\`)
		out = append(out, filepath.Join(lib, "steamapps", "common", "Escape from Tarkov"))
	}
	return out
}

func defaultScreenshotsPath() string {
	docs, err := windows.KnownFolderPath(windows.FOLDERID_Documents, 0) // OneDrive に移したドキュメントにも対応
	if err != nil {
		home, _ := os.UserHomeDir()
		docs = filepath.Join(home, "Documents")
	}
	return filepath.Join(docs, "Escape from Tarkov", "Screenshots")
}

const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const runName = "TarkovSupportCompanion"

func autostartSupported() bool { return true }

func setAutostart(on bool) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer key.Close()
	if !on {
		err := key.DeleteValue(runName)
		if err == registry.ErrNotExist {
			return nil
		}
		return err
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	return key.SetStringValue(runName, `"`+exe+`"`)
}

func openBrowser(url string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func runUI(url string) {
	systray.Run(func() {
		systray.SetIcon(trayIcon)
		systray.SetTitle("タルコフサポート")
		systray.SetTooltip("タルコフサポート 常駐中")
		open := systray.AddMenuItem("画面を開く", "設定と状態")
		systray.AddSeparator()
		quit := systray.AddMenuItem("終了", "常駐をやめる")
		systray.SetOnTapped(func() { openBrowser(url) })
		go func() {
			for {
				select {
				case <-open.ClickedCh:
					openBrowser(url)
				case <-quit.ClickedCh:
					systray.Quit()
					return
				}
			}
		}()
	}, func() { os.Exit(0) })
}
