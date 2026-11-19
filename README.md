# タルコフサポート

Escape from Tarkov（PvP）の進行をサポートする自分用のWebアプリ（PWA）。
Mac・Windows・iPadのブラウザで使え、iPadではホーム画面に追加してアプリのように使えます。

公開URL: https://kakakanokaito.github.io/tarkov-support/

## できること（フェーズ1）

- **ホーム**：今やるべきこと3つと理由。方針（バランス／タスク／ハイドアウト）を切り替え可能
- **タスク**：受注中・受注可能・もうすぐ解放・ロック中・完了。「ここまで完了」で前提タスクごとまとめてチェック
- **ハイドアウト**：施設レベルと次のレベルの必要素材、全施設の残り素材の合計
- **アイテム**：日本語・英語・略称・ひらがなで検索。タスク／ハイドアウトでの必要数と4分類（売ってはダメ／取っておく／売ってOK／捨ててOK）、一番高い売り先
- **設定**：初期設定（レベル・陣営・LL・トレーダーごとの完了位置）、端末間同期、進捗のファイル保存

## データ

- ゲームデータは [tarkov.dev](https://tarkov.dev) の GraphQL API（PvP、日本語＋英語）から毎回取得し、6時間キャッシュします。自前ではデータを持ちません。
- GraphQL API が落ちている時は、tarkov.dev が公開している元データ（json.tarkov.dev）から同じ形に組み直して使います。
- 進捗はブラウザ（localStorage）に保存。端末間同期は GitHub の非公開 Gist を使います（設定画面で gist 権限だけのトークンを貼る）。

## 開発

```sh
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド（dist/）
```

`main` に push すると GitHub Actions で GitHub Pages に公開されます。

`scripts/mock-data.mjs` は画面確認用のダミーデータです（本物のデータではありません）。

## 構成

```
src/api/tarkov.ts      tarkov.dev からの取得・キャッシュ
src/logic/index.ts     タスク状態・必要アイテム・4分類の判定
src/logic/goals.ts     今やるべきことの点数づけ
src/store/progress.ts  進捗の保存
src/store/sync.ts      Gist同期
src/store/events.ts    外部（常駐ソフトのログ読み取り）からの自動更新の入口
src/views/             各画面
```
