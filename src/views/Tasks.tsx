import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../AppContext'
import { ancestors, factionOk, normalizeQuery, taskDepths, taskInfo } from '../logic'
import type { TaskInfo, TaskStatus } from '../logic'
import { ItemIcon, Term, useNav } from '../components/common'
import { Check, ExternalLink, GitBranch, ListChecks, Lock, MapPin, Play, RotateCcw, Search, UserPlus } from 'lucide-react'
import type { Task } from '../types'

type Filter = 'active' | 'available' | 'soon' | 'locked' | 'done' | 'all'
const FILTERS: { v: Filter; label: string }[] = [
  { v: 'active', label: '受注中' },
  { v: 'available', label: '受注可能' },
  { v: 'soon', label: 'もうすぐ解放' },
  { v: 'locked', label: 'ロック中' },
  { v: 'done', label: '完了' },
  { v: 'all', label: 'すべて' },
]

const STATUS_LABEL: Record<TaskStatus, string> = {
  done: '完了', active: '受注中', available: '受注可能', locked: 'ロック中',
}

export default function Tasks() {
  const { idx, progress, update } = useApp()
  const nav = useNav()
  const [filter, setFilter] = useState<Filter>('active')
  const [trader, setTrader] = useState<string>('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const focusRef = useRef<HTMLLIElement | null>(null)

  // ホームなどから特定タスクに飛んできた場合
  useEffect(() => {
    if (nav.focusTask) {
      setFilter('all')
      setTrader('')
      setQ('')
      setOpen(nav.focusTask)
      setTimeout(() => focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
    }
  }, [nav.focusTask])

  const depths = useMemo(() => (idx ? taskDepths(idx) : new Map<string, number>()), [idx])
  const traderOrder = useMemo(() => new Map((idx?.data.traders ?? []).map((t, i) => [t.id, i])), [idx])

  const rows = useMemo(() => {
    if (!idx) return []
    const nq = normalizeQuery(q)
    const list: { t: Task; info: TaskInfo }[] = []
    for (const t of idx.data.tasks) {
      if (!factionOk(t, progress)) continue
      if (trader && t.traderId !== trader) continue
      if (nq && !normalizeQuery(t.name.ja + '|' + t.name.en).includes(nq)) continue
      const info = taskInfo(t, progress, idx)
      const ok =
        filter === 'all' ||
        (filter === 'soon' ? info.status === 'locked' && info.soon : info.status === filter)
      if (ok) list.push({ t, info })
    }
    return list.sort(
      (a, b) =>
        (traderOrder.get(a.t.traderId) ?? 99) - (traderOrder.get(b.t.traderId) ?? 99) ||
        (depths.get(a.t.id) ?? 0) - (depths.get(b.t.id) ?? 0) ||
        a.t.minPlayerLevel - b.t.minPlayerLevel,
    )
  }, [idx, progress, filter, trader, q, depths, traderOrder])

  if (!idx) return null

  const setState = (id: string, s: 'active' | 'done' | null) =>
    update((p) => {
      const tasks = { ...p.tasks }
      if (s) tasks[id] = s
      else delete tasks[id]
      return { ...p, tasks }
    })

  const markUpTo = (id: string) =>
    update((p) => {
      const tasks = { ...p.tasks }
      for (const a of ancestors(id, idx, p)) tasks[a] = 'done'
      return { ...p, tasks }
    })

  return (
    <div className="page tasks">
      <div className="toolbar">
        <label className="search-wrap">
          <Search size={16} aria-hidden />
          <input className="search" type="search" placeholder="タスク名（日本語 / English）"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select value={trader} onChange={(e) => setTrader(e.target.value)} aria-label="トレーダー">
          <option value="">全トレーダー</option>
          {idx.data.traders.filter((t) => idx.data.tasks.some((x) => x.traderId === t.id)).map((t) => (
            <option key={t.id} value={t.id}>{t.name.ja}</option>
          ))}
        </select>
      </div>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.v} className={filter === f.v ? 'chip on' : 'chip'} onClick={() => setFilter(f.v)}>{f.label}</button>
        ))}
      </div>
      <p className="count label">{rows.length} tasks</p>
      <ul className="task-list">
        {rows.map(({ t, info }) => {
          const isOpen = open === t.id
          const children = (idx.children.get(t.id) ?? [])
            .map((c) => idx.task.get(c))
            .filter((c): c is Task => !!c && factionOk(c, progress))
          return (
            <li key={t.id} className={`card task s-${info.status}`} ref={nav.focusTask === t.id ? focusRef : undefined}>
              <button className="task-head" onClick={() => setOpen(isOpen ? null : t.id)} aria-expanded={isOpen}>
                <span className={`dot s-${info.status}`} aria-hidden />
                <span className="task-title">
                  <span className="ja">{t.name.ja}</span>
                  {t.name.en !== t.name.ja && <span className="en">{t.name.en}</span>}
                </span>
                <span className="task-meta">
                  {idx.traderName.get(t.traderId)}
                  {t.mapId && <><MapPin size={12} aria-hidden />{idx.mapName.get(t.mapId)}</>}
                  {t.minPlayerLevel > 1 && <span className="lv">Lv{t.minPlayerLevel}</span>}
                </span>
                {t.kappaRequired && <span className="tag kappa">Kappa</span>}
                <span className={`status-label s-${info.status}`}>{STATUS_LABEL[info.status]}</span>
              </button>
              {isOpen && (
                <div className="task-body">
                  {info.lockReasons.length > 0 && (
                    <p className="lock"><Lock size={14} aria-hidden /> {info.lockReasons.join(' ／ ')}</p>
                  )}
                  <ul className="objectives">
                    {t.objectives.map((o) => (
                      <li key={o.id} className={o.optional ? 'optional' : ''}>
                        {o.itemIds.length > 0 && (
                          <span className="obj-items">
                            {o.itemIds.slice(0, 4).map((iid) => (
                              <button key={iid} className="icon-btn" onClick={() => nav.openItem(iid)} title="アイテム詳細">
                                <ItemIcon item={idx.item.get(iid)} size={32} />
                              </button>
                            ))}
                          </span>
                        )}
                        <span>
                          {o.optional && <span className="tag">任意</span>}
                          {o.description}
                          {o.foundInRaid && <> <Term k="FIR">（FIR）</Term></>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {children.length > 0 && (
                    <p className="unlocks">
                      <GitBranch size={14} aria-label="完了で解放" />
                      {children.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && '、'}
                          <button className="link" onClick={() => nav.goTask(c.id)}>{c.name.ja}</button>
                        </span>
                      ))}
                    </p>
                  )}
                  {t.unlocksTraderIds.length > 0 && (
                    <p className="unlocks"><UserPlus size={14} aria-label="トレーダー解放" />{t.unlocksTraderIds.map((id) => idx.traderName.get(id)).join('、')}</p>
                  )}
                  <div className="actions">
                    {info.status !== 'done' && info.status !== 'active' && (
                      <button onClick={() => setState(t.id, 'active')}><Play size={15} />受注</button>
                    )}
                    {info.status !== 'done' && (
                      <button className="primary" onClick={() => setState(t.id, 'done')}><Check size={15} />完了</button>
                    )}
                    {info.status !== 'done' && t.requires.length > 0 && (
                      <button onClick={() => markUpTo(t.id)} title="このタスクと前提タスクを全部完了にする"><ListChecks size={15} />ここまで完了</button>
                    )}
                    {(info.status === 'done' || info.status === 'active') && (
                      <button className="ghost" onClick={() => setState(t.id, null)}><RotateCcw size={15} />戻す</button>
                    )}
                    {t.wikiLink && <a className="ghost" href={t.wikiLink} target="_blank" rel="noreferrer"><ExternalLink size={15} />Wiki</a>}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
