import { useMemo, useRef, useState } from 'react'
import { useApp } from '../AppContext'
import { ancestors, factionOk, taskDepths } from '../logic'
import { Stepper, Term, rub } from '../components/common'
import { defaultProgress, normalizeProgress } from '../store/progress'

export default function Settings() {
  const { idx, data, progress, update, replaceProgress, refresh, loading, loadError, sync, syncSettings, connectSync, disconnectSync, syncNow } = useApp()
  const [token, setToken] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const depths = useMemo(() => (idx ? taskDepths(idx) : new Map<string, number>()), [idx])
  const traderTasks = useMemo(() => {
    if (!idx) return []
    return idx.data.traders
      .map((tr) => ({
        trader: tr,
        tasks: idx.data.tasks
          .filter((t) => t.traderId === tr.id && factionOk(t, progress))
          .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0) || a.minPlayerLevel - b.minPlayerLevel),
      }))
      .filter((x) => x.tasks.length)
  }, [idx, progress, depths])

  if (!idx || !data) return null

  const markUpTo = (taskId: string) =>
    update((p) => {
      const tasks = { ...p.tasks }
      for (const a of ancestors(taskId, idx, p)) tasks[a] = 'done'
      return { ...p, tasks }
    })

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(progress, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `tarkov-support-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (f: File) => {
    try {
      const p = normalizeProgress(JSON.parse(await f.text()))
      replaceProgress({ ...p, updatedAt: Date.now() })
      alertMsg('読み込みました')
    } catch {
      alertMsg('読み込めませんでした（形式が違います）')
    }
  }
  const alertMsg = (m: string) => setSyncMsg(m)

  return (
    <div className="page settings">
      <section className="card">
        <h2 className="label">Setup<span>初期設定</span></h2>
        <div className="form-grid">
          <label>プレイヤーレベル</label>
          <Stepper value={progress.playerLevel} min={1} max={79} onChange={(n) => update((p) => ({ ...p, playerLevel: n }))} />
          <label>陣営</label>
          <div className="seg">
            {(['USEC', 'BEAR'] as const).map((f) => (
              <button key={f} className={progress.faction === f ? 'on' : ''} onClick={() => update((p) => ({ ...p, faction: f }))}>{f}</button>
            ))}
          </div>
        </div>

        <h3>トレーダーの<Term k="LL" /></h3>
        <div className="trader-grid">
          {idx.data.traders.filter((t) => t.levels.length > 1).map((t) => (
            <div key={t.id} className="trader-ll">
              {t.imageLink && <img src={t.imageLink} alt="" width={40} height={40} />}
              <span>{t.name.ja}</span>
              <Stepper value={progress.traderLL[t.id] ?? 1} min={1} max={Math.max(1, t.levels.length)} label={`LL${progress.traderLL[t.id] ?? 1}`}
                onChange={(n) => update((p) => ({ ...p, traderLL: { ...p.traderLL, [t.id]: n } }))} />
            </div>
          ))}
        </div>

        <h3>どこまで終えたか</h3>
        <p className="muted small">最後に終えたタスクを選ぶと、前提タスクもまとめて完了に。</p>
        <div className="upto-list">
          {traderTasks.map(({ trader, tasks }) => {
            const doneCount = tasks.filter((t) => progress.tasks[t.id] === 'done').length
            return (
              <div key={trader.id} className="upto">
                <span className="upto-name">{trader.name.ja}<small className="muted"> {doneCount}/{tasks.length}</small></span>
                <select value="" onChange={(e) => e.target.value && markUpTo(e.target.value)} aria-label={`${trader.name.ja}のタスク`}>
                  <option value="">このタスクまで完了…</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {progress.tasks[t.id] === 'done' ? '✓ ' : ''}{t.name.ja}{t.name.en !== t.name.ja ? ` (${t.name.en})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>


        {!progress.setupDone && (
          <button className="primary wide" onClick={() => update((p) => ({ ...p, setupDone: true }))}>初期設定を終える</button>
        )}
      </section>

      <section className="card">
        <h2 className="label">Sync<span>端末間の同期</span></h2>
        {syncSettings.token ? (
          <>
            <p>
              同期中 ・ {sync.kind === 'ok' && `最終同期 ${new Date(sync.at).toLocaleTimeString('ja-JP')}`}
              {sync.kind === 'syncing' && '同期しています…'}
              {sync.kind === 'error' && <span className="error">エラー：{sync.message}</span>}
            </p>
            <div className="actions">
              <button onClick={syncNow}>今すぐ同期</button>
              <button className="ghost" onClick={disconnectSync}>この端末の同期を解除</button>
            </div>
          </>
        ) : (
          <>
            <ol className="howto">
              <li>
                <a href="https://github.com/settings/tokens/new?scopes=gist&description=tarkov-support" target="_blank" rel="noreferrer">GitHubのトークン作成ページ</a>
                を開く（gistのみ選択済み）
              </li>
              <li>「Generate token」→ <code>ghp_…</code> をコピー</li>
              <li>下に貼る。他の端末にも同じものを貼る</li>
            </ol>
            <p className="muted small">保存先は非公開のGist。トークンはこの端末内だけに保存。</p>
            <div className="toolbar">
              <input className="search" type="password" placeholder="ghp_..." value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
              <button className="primary" disabled={!token || sync.kind === 'syncing'}
                onClick={() => connectSync(token).then(() => { setToken(''); setSyncMsg('同期を始めました') }, () => {})}>
                同期を始める
              </button>
            </div>
            {sync.kind === 'error' && <p className="error">{sync.message}</p>}
          </>
        )}
        {syncMsg && <p className="ok-msg">{syncMsg}</p>}
      </section>

      <section className="card">
        <h2 className="label">Loot<span>アイテム判定</span></h2>
        <div className="form-grid">
          <label>売ってOKの下限（1マス）</label>
          <Stepper value={progress.sellThreshold} min={0} max={100000} step={1000} label={rub(progress.sellThreshold)}
            onChange={(n) => update((p) => ({ ...p, sellThreshold: n }))} />
        </div>
        <div className="actions">
          {[3000, 8000, 15000, 30000].map((v) => (
            <button key={v} className={progress.sellThreshold === v ? 'chip on' : 'chip'} onClick={() => update((p) => ({ ...p, sellThreshold: v }))}>{rub(v)}</button>
          ))}
        </div>
        <p className="muted small">これ未満は「捨ててOK」。</p>
      </section>

      <section className="card">
        <h2 className="label">Data<span>データ</span></h2>
        <p className="small">
          ゲームデータ：tarkov.dev（PvP）・取得 {new Date(data.fetchedAt).toLocaleString('ja-JP')}
          ・タスク{data.tasks.length}件・アイテム{data.items.length}件
        </p>
        {loadError && <p className="error">{loadError}</p>}
        <div className="actions">
          <button onClick={refresh} disabled={loading}>{loading ? '取得中…' : '最新データを取得'}</button>
          <button onClick={exportJson}>進捗をファイルに保存</button>
          <button onClick={() => fileRef.current?.click()}>ファイルから読み込む</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className="ghost danger" onClick={() => {
            if (confirm('進捗をすべて消して最初からにしますか？')) replaceProgress({ ...defaultProgress(), updatedAt: Date.now() })
          }}>進捗をリセット</button>
        </div>
      </section>
    </div>
  )
}
