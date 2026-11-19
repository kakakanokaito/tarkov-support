// GitHub Gist を使った端末間同期。
// ・各端末に「gist権限だけのトークン」を保存（トークンは同期しない）
// ・進捗は非公開Gistの1ファイルに丸ごと保存し、updatedAt が新しい方を採用（後勝ち）
import type { Progress } from '../types'
import { normalizeProgress } from './progress'

const SETTINGS_KEY = 'tarkov-support.sync.v1'
const FILE_NAME = 'tarkov-support-progress.json'
const API = 'https://api.github.com'

export interface SyncSettings {
  token: string
  gistId: string
}

export function loadSyncSettings(): SyncSettings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY)
    if (s) return { token: '', gistId: '', ...JSON.parse(s) }
  } catch {
    /* noop */
  }
  return { token: '', gistId: '' }
}

export function saveSyncSettings(s: SyncSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* noop */
  }
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) throw new Error('トークンが無効です（期限切れか、貼り間違い）')
  if (res.status === 403 || res.status === 404)
    throw new Error('Gistにアクセスできません（トークンに gist 権限があるか確認してください）')
  if (!res.ok) throw new Error(`GitHub エラー: HTTP ${res.status}`)
  return res.json()
}

/** 既存の同期用Gistを探す。無ければ作る。 */
export async function findOrCreateGist(token: string, initial: Progress): Promise<string> {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`)
    const hit = list.find((g: { files: Record<string, unknown> }) => g.files && FILE_NAME in g.files)
    if (hit) return hit.id
    if (list.length < 100) break
  }
  const created = await gh(token, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: 'タルコフサポート 進捗データ（自動同期）',
      public: false,
      files: { [FILE_NAME]: { content: JSON.stringify(initial, null, 1) } },
    }),
  })
  return created.id
}

export async function pullRemote(s: SyncSettings): Promise<Progress | null> {
  const g = await gh(s.token, `/gists/${s.gistId}`)
  const f = g.files?.[FILE_NAME]
  if (!f) return null
  let content: string = f.content
  if (f.truncated && f.raw_url) content = await (await fetch(f.raw_url)).text()
  try {
    return normalizeProgress(JSON.parse(content))
  } catch {
    return null
  }
}

export async function pushRemote(s: SyncSettings, p: Progress): Promise<void> {
  await gh(s.token, `/gists/${s.gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE_NAME]: { content: JSON.stringify(p, null, 1) } } }),
  })
}
