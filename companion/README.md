# 常駐ソフト（Windows）

ゲームPCで動かす小さな常駐ソフト。ゲームが書くファイルを**読むだけ**で、メモリ読み取りやキー入力はしません。

- **ログ監視**：`Logs/log_…/` の application・notifications ログから、タスクの受注／完了／失敗、レイド開始とマップ、フリマ売却を拾う。初回は残っている過去ログもすべて読む。PvE の分は無視。
- **スクショ監視**：`ドキュメント/Escape from Tarkov/Screenshots` に増えたスクショのファイル名から、座標と向きを読む。
- **送信**：同期用の非公開 Gist に `tarkov-support-companion.json`（イベント全部＋最後の現在地）を書く。同時に ntfy.sh の秘密トピック（トークンと Gist ID のハッシュ）へすぐ流すので、アプリを開いていれば1秒ほどで届く。

## 使い方

1. [TarkovCompanion.exe](https://github.com/kakakanokaito/tarkov-support/releases/latest/download/TarkovCompanion.exe) をダウンロードして起動（初回は SmartScreen の「詳細情報 → 実行」）
2. 開いた画面に、アプリの「設定 → 常駐ソフト」でコピーした連携コードを貼る
3. 以後はタスクトレイに常駐。Windows 起動時に自動で起動（画面の Settings で切替）

設定画面: http://127.0.0.1:47321 （このPCからだけ開ける）
設定・記録の保存先: `%APPDATA%\TarkovSupport\`

## 開発

```sh
go test ./...
GOOS=windows GOARCH=amd64 go build -ldflags "-H=windowsgui" -o TarkovCompanion.exe .
# Mac/Linux で動作確認（トレイなし）
TKS_LOGS=/path/to/Logs TKS_SHOTS=/path/to/Screenshots go run .
```

main に push すると GitHub Actions が exe を作ってリリースに置く（`.github/workflows/companion.yml`）。
