import { useCallback, useMemo, useState } from 'react'
import { ClipboardList, Crosshair, Package, RefreshCw, SlidersHorizontal, Warehouse, Cloud, CloudOff, AlertTriangle } from 'lucide-react'
import { AppProvider, useApp } from './AppContext'
import { NavCtx } from './components/common'
import type { Tab } from './components/common'
import ItemSheet from './components/ItemSheet'
import Home from './views/Home'
import Tasks from './views/Tasks'
import Hideout from './views/Hideout'
import Items from './views/Items'
import Settings from './views/Settings'

const TABS: { v: Tab; label: string; icon: typeof Crosshair }[] = [
  { v: 'home', label: 'ホーム', icon: Crosshair },
  { v: 'tasks', label: 'タスク', icon: ClipboardList },
  { v: 'hideout', label: 'ハイドアウト', icon: Warehouse },
  { v: 'items', label: 'アイテム', icon: Package },
  { v: 'settings', label: '設定', icon: SlidersHorizontal },
]

function Shell() {
  const { data, loading, loadError, refresh, sync } = useApp()
  const [tab, setTabState] = useState<Tab>(() => (localStorage.getItem('tarkov-support.tab') as Tab) || 'home')
  const [itemId, setItemId] = useState<string | null>(null)
  const [focusTask, setFocusTask] = useState<string | null>(null)
  const [focusStation, setFocusStation] = useState<string | null>(null)

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    setFocusTask(null)
    setFocusStation(null)
    try { localStorage.setItem('tarkov-support.tab', t) } catch { /* noop */ }
    window.scrollTo({ top: 0 })
  }, [])

  const nav = useMemo(() => ({
    tab, setTab,
    itemId, openItem: setItemId, closeItem: () => setItemId(null),
    focusTask, goTask: (id: string) => { setTabState('tasks'); setFocusTask(id) },
    focusStation, goStation: (id: string) => { setTabState('hideout'); setFocusStation(id) },
  }), [tab, setTab, itemId, focusTask, focusStation])

  const SyncIcon = sync.kind === 'off' ? CloudOff : sync.kind === 'error' ? AlertTriangle : Cloud

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <nav className="sidenav" aria-label="メニュー">
          <div className="brand">
            <span className="brand-mark" aria-hidden><Crosshair size={18} /></span>
            <span className="brand-text">TARKOV<small>SUPPORT</small></span>
          </div>
          {TABS.map(({ v, label, icon: I }) => (
            <button key={v} className={tab === v ? 'nav-btn on' : 'nav-btn'} onClick={() => setTab(v)} aria-current={tab === v}>
              <I size={20} strokeWidth={1.8} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
          <div className="nav-foot">
            <span className={`sync-ind s-${sync.kind}`} title={sync.kind === 'error' ? sync.message : '同期'}>
              <SyncIcon size={14} aria-hidden />
              {sync.kind === 'off' ? 'LOCAL' : sync.kind === 'error' ? 'ERROR' : sync.kind === 'syncing' ? 'SYNC…' : 'SYNCED'}
            </span>
          </div>
        </nav>

        <main className="main">
          {!data && loading && (
            <div className="boot">
              <RefreshCw className="spin" size={22} aria-hidden />
              <span className="label">Loading intel<span>tarkov.dev からデータを取得中</span></span>
            </div>
          )}
          {!data && !loading && loadError && (
            <div className="boot">
              <AlertTriangle size={22} aria-hidden />
              <p className="error">{loadError}</p>
              <button className="primary" onClick={refresh}>再試行</button>
            </div>
          )}
          {data && (
            <>
              {tab === 'home' && <Home />}
              {tab === 'tasks' && <Tasks />}
              {tab === 'hideout' && <Hideout />}
              {tab === 'items' && <Items />}
              {tab === 'settings' && <Settings />}
            </>
          )}
        </main>
        <ItemSheet />
      </div>
    </NavCtx.Provider>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
