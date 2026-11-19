// 進捗の保存（localStorage）。端末間の同期は sync.ts。
import type { Progress } from '../types'

const KEY = 'tarkov-support.progress.v1'

export function defaultProgress(): Progress {
  return {
    v: 1,
    updatedAt: 0,
    playerLevel: 1,
    faction: 'USEC',
    traderLL: {},
    tasks: {},
    hideout: {},
    policy: 'balance',
    sellThreshold: 8000,
    setupDone: false,
  }
}

export function normalizeProgress(raw: unknown): Progress {
  const d = defaultProgress()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<Progress>
  return {
    ...d,
    ...r,
    traderLL: { ...(r.traderLL ?? {}) },
    tasks: { ...(r.tasks ?? {}) },
    hideout: { ...(r.hideout ?? {}) },
    v: 1,
  }
}

export function loadProgress(): Progress {
  try {
    const s = localStorage.getItem(KEY)
    return s ? normalizeProgress(JSON.parse(s)) : defaultProgress()
  } catch {
    return defaultProgress()
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* 容量超過などは無視 */
  }
}
