// Windows 常駐ソフト（companion/）との連携。
// ・常駐ソフトは同期用Gistに companion ファイル（全イベント＋現在地）を書く → 開いた時に取り込む
// ・同時に ntfy.sh の秘密トピックへすぐ流す → 開いている間は1秒以内に届く
// トピック名はトークンとGist IDのハッシュ（常駐ソフト側と同じ計算）。
import type { ProgressEvent } from './events'
import type { SyncSettings } from './sync'

export const COMPANION_FILE = 'tarkov-support-companion.json'
export const COMPANION_DOWNLOAD =
  'https://github.com/kakakanokaito/tarkov-support/releases/latest/download/TarkovCompanion.exe'

export interface LivePosition {
  map?: string // ゲーム内部のマップ名（bigmap など）
  x: number
  y: number
  z: number
  yaw: number
  at: number
  file?: string
}

export interface CompanionFile {
  v: number
  version?: string
  updatedAt: number
  events: ProgressEvent[]
  position: LivePosition | null
}

export function parseCompanionFile(text: string | undefined | null): CompanionFile | null {
  if (!text) return null
  try {
    const j = JSON.parse(text)
    if (!j || !Array.isArray(j.events)) return null
    return { v: j.v ?? 1, version: j.version, updatedAt: j.updatedAt ?? 0, events: j.events, position: j.position ?? null }
  } catch {
    return null
  }
}

/** 常駐ソフトに貼る連携コード。中身はトークンとGist ID（この端末からコピーして、ゲームPCに貼る） */
export function pairCode(s: SyncSettings): string {
  const json = JSON.stringify({ t: s.token, g: s.gistId })
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
  return 'TKS1-' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function liveTopic(s: SyncSettings): Promise<string> {
  const data = new TextEncoder().encode(`tarkov-support:${s.gistId}:${s.token}`)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
  return 'tks-' + hex.slice(0, 24)
}

type LiveMsg = { k: 'pos'; pos: LivePosition } | { k: 'ev'; events: ProgressEvent[] }

/** ntfy のトピックを購読する。戻り値で購読をやめる。 */
export function subscribeLive(
  topic: string,
  on: { pos: (p: LivePosition) => void; events: (e: ProgressEvent[]) => void; state: (connected: boolean) => void },
): () => void {
  let es: EventSource | null = null
  let lastId = ''
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const open = () => {
    if (closed) return
    // 再接続した時は、切れていた間の分も受け取る
    const since = lastId || '10m'
    es = new EventSource(`https://ntfy.sh/${topic}/sse?since=${since}`)
    es.onopen = () => on.state(true)
    es.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data)
        if (m.event && m.event !== 'message') return
        if (m.id) lastId = m.id
        const body = JSON.parse(m.message) as LiveMsg
        if (body.k === 'pos' && body.pos) on.pos(body.pos)
        if (body.k === 'ev' && Array.isArray(body.events)) on.events(body.events)
      } catch {
        /* 関係ないメッセージは無視 */
      }
    }
    es.onerror = () => {
      on.state(false)
      es?.close()
      retry = setTimeout(open, 5000)
    }
  }
  open()
  return () => {
    closed = true
    clearTimeout(retry)
    es?.close()
  }
}

// 最後の現在地はこの端末に覚えておく（開き直しても表示できるように）
const POS_KEY = 'tarkov-support.livepos.v1'
export function loadLastPosition(): LivePosition | null {
  try {
    const s = localStorage.getItem(POS_KEY)
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}
export function saveLastPosition(p: LivePosition) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    /* noop */
  }
}

/** ゲーム内部のマップ名 → 表示名（tarkov.dev のデータが無い時の予備） */
const MAP_JA: Record<string, string> = {
  bigmap: 'カスタム', factory4_day: '工場', factory4_night: '工場（夜）', woods: 'ウッズ', shoreline: 'ショアライン',
  interchange: 'インターチェンジ', laboratory: 'ラボ', rezervbase: 'リザーブ', tarkovstreets: 'ストリート',
  lighthouse: 'ライトハウス', sandbox: 'グラウンドゼロ', sandbox_high: 'グラウンドゼロ', labyrinth: 'ラビリンス',
}
export function mapLabel(nameId: string | undefined, maps?: { nameId?: string; name: { ja: string } }[]): string {
  if (!nameId) return '—'
  const hit = maps?.find((m) => m.nameId?.toLowerCase() === nameId.toLowerCase())
  return hit?.name.ja ?? MAP_JA[nameId.toLowerCase()] ?? nameId
}
