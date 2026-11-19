import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GameData, Progress } from './types'
import { fetchGameData, loadCachedGameData, STALE_MS } from './api/tarkov'
import { buildIndex, buildNeeds } from './logic'
import type { Index, Need } from './logic'
import { loadProgress, saveProgress } from './store/progress'
import { findOrCreateGist, loadSyncSettings, pullRemote, pushRemote, saveSyncSettings } from './store/sync'
import type { SyncSettings } from './store/sync'
import { applyEvents } from './store/events'
import type { ProgressEvent } from './store/events'
import { liveTopic, loadLastPosition, saveLastPosition, subscribeLive } from './store/companion'
import type { LivePosition } from './store/companion'

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: number }
  | { kind: 'error'; message: string }

interface Ctx {
  data: GameData | null
  idx: Index | null
  needs: Map<string, Need[]>
  loading: boolean
  loadError: string | null
  refresh: () => void
  progress: Progress
  update: (fn: (p: Progress) => Progress) => void
  replaceProgress: (p: Progress) => void
  /** 常駐ソフトなど外部からのイベントで進捗を更新する */
  applyProgressEvents: (events: ProgressEvent[]) => void
  sync: SyncState
  syncSettings: SyncSettings
  connectSync: (token: string) => Promise<void>
  disconnectSync: () => void
  syncNow: () => void
  /** 常駐ソフトから届いた現在地 */
  livePos: LivePosition | null
  /** 常駐ソフトの即時連絡（ntfy）につながっているか */
  liveConnected: boolean
  /** 常駐ソフトが最後にGistへ書いた時刻 */
  companionAt: number
}

const AppCtx = createContext<Ctx | null>(null)

export function useApp() {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppProvider missing')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GameData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(loadSyncSettings)
  const [sync, setSync] = useState<SyncState>({ kind: 'off' })
  const lastSynced = useRef(0)
  const [livePos, setLivePos] = useState<LivePosition | null>(loadLastPosition)
  const [liveConnected, setLiveConnected] = useState(false)
  const [companionAt, setCompanionAt] = useState(0)

  // ── ゲームデータ ──
  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setData(await fetchGameData())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    loadCachedGameData().then((cached) => {
      if (!alive) return
      if (cached) {
        setData(cached)
        setLoading(false)
        if (Date.now() - cached.fetchedAt > STALE_MS && navigator.onLine) refresh()
      } else {
        refresh()
      }
    })
    return () => {
      alive = false
    }
  }, [refresh])

  const idx = useMemo(() => (data ? buildIndex(data) : null), [data])
  const needs = useMemo(() => (idx ? buildNeeds(idx, progress) : new Map<string, Need[]>()), [idx, progress])

  // ── 進捗 ──
  const update = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((p) => {
      const next = { ...fn(p), updatedAt: Date.now() }
      saveProgress(next)
      return next
    })
  }, [])

  const replaceProgress = useCallback((p: Progress) => {
    saveProgress(p)
    setProgress(p)
  }, [])

  const applyProgressEvents = useCallback((events: ProgressEvent[]) => {
    setProgress((p) => {
      const next = applyEvents(p, events)
      if (next !== p) saveProgress(next)
      return next
    })
  }, [])

  const acceptPosition = useCallback((pos: LivePosition | null | undefined) => {
    if (!pos || typeof pos.x !== 'number') return
    setLivePos((cur) => {
      if (cur && cur.at >= pos.at) return cur
      saveLastPosition(pos)
      return pos
    })
  }, [])

  // ── 同期 ──
  const progressRef = useRef(progress)
  progressRef.current = progress

  const doPull = useCallback(async (s: SyncSettings) => {
    if (!s.token || !s.gistId) return
    setSync({ kind: 'syncing' })
    try {
      const { progress: remote, companion } = await pullRemote(s)
      const local = progressRef.current
      if (remote && remote.updatedAt > local.updatedAt) {
        replaceProgress(remote)
        lastSynced.current = remote.updatedAt
      } else if (!remote || local.updatedAt > remote.updatedAt) {
        await pushRemote(s, local)
        lastSynced.current = local.updatedAt
      } else {
        lastSynced.current = local.updatedAt
      }
      if (companion) {
        applyProgressEvents(companion.events)
        acceptPosition(companion.position)
        setCompanionAt(companion.updatedAt)
      }
      setSync({ kind: 'ok', at: Date.now() })
    } catch (e) {
      setSync({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [replaceProgress, applyProgressEvents, acceptPosition])

  // 起動時・画面に戻った時に取り込む
  useEffect(() => {
    if (!syncSettings.token || !syncSettings.gistId) {
      setSync({ kind: 'off' })
      return
    }
    doPull(syncSettings)
    const onVis = () => document.visibilityState === 'visible' && doPull(syncSettings)
    document.addEventListener('visibilitychange', onVis)
    // 開いている間は時々取り込む（常駐ソフトの記録の取りこぼし対策）
    const iv = setInterval(() => document.visibilityState === 'visible' && doPull(syncSettings), 3 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(iv)
    }
  }, [syncSettings, doPull])

  // 常駐ソフトからの即時連絡（画面が見えている間だけつなぐ）
  useEffect(() => {
    if (!syncSettings.token || !syncSettings.gistId) return
    let stop: (() => void) | null = null
    let alive = true
    const connect = async () => {
      if (stop || document.visibilityState !== 'visible') return
      const topic = await liveTopic(syncSettings)
      if (!alive || stop) return
      stop = subscribeLive(topic, { pos: acceptPosition, events: applyProgressEvents, state: setLiveConnected })
    }
    const disconnect = () => {
      stop?.()
      stop = null
      setLiveConnected(false)
    }
    const onVis = () => (document.visibilityState === 'visible' ? connect() : disconnect())
    connect()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      disconnect()
    }
  }, [syncSettings, acceptPosition, applyProgressEvents])

  // ローカルで変更したら少し待って送る
  useEffect(() => {
    if (!syncSettings.token || !syncSettings.gistId) return
    if (progress.updatedAt <= lastSynced.current) return
    const t = setTimeout(async () => {
      setSync({ kind: 'syncing' })
      try {
        await pushRemote(syncSettings, progressRef.current)
        lastSynced.current = progressRef.current.updatedAt
        setSync({ kind: 'ok', at: Date.now() })
      } catch (e) {
        setSync({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    }, 2000)
    return () => clearTimeout(t)
  }, [progress, syncSettings])

  const connectSync = useCallback(async (token: string) => {
    setSync({ kind: 'syncing' })
    try {
      const gistId = await findOrCreateGist(token.trim(), progressRef.current)
      const s = { token: token.trim(), gistId }
      saveSyncSettings(s)
      setSyncSettings(s)
    } catch (e) {
      setSync({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }, [])

  const disconnectSync = useCallback(() => {
    const s = { token: '', gistId: '' }
    saveSyncSettings(s)
    setSyncSettings(s)
  }, [])

  const syncNow = useCallback(() => doPull(syncSettings), [doPull, syncSettings])

  const value: Ctx = {
    data, idx, needs, loading, loadError, refresh, progress, update, replaceProgress, applyProgressEvents,
    sync, syncSettings, connectSync, disconnectSync, syncNow, livePos, liveConnected, companionAt,
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
