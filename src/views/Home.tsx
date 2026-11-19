import { useMemo } from 'react'
import { ChevronRight, ClipboardList, GitBranch, Hammer, MapPin, Sparkles, UserPlus, Warehouse, Zap, Gauge, Wrench, Check } from 'lucide-react'
import { useApp } from '../AppContext'
import { computeGoals } from '../logic/goals'
import type { ReasonKind } from '../logic/goals'
import { taskInfo, factionOk } from '../logic'
import { Stepper, useNav, WithTerms } from '../components/common'
import type { Policy } from '../types'
import LiveCard from '../components/LiveCard'

const POLICIES: { v: Policy; label: string }[] = [
  { v: 'balance', label: 'バランス' },
  { v: 'task', label: 'タスク' },
  { v: 'hideout', label: 'ハイドアウト' },
]

const REASON_ICON: Record<ReasonKind, typeof GitBranch> = {
  unlock: GitBranch,
  trader: UserPlus,
  map: MapPin,
  effect: Zap,
  station: Hammer,
  easy: Check,
  skill: Wrench,
  ready: Sparkles,
}

export default function Home() {
  const { idx, progress, update } = useApp()
  const nav = useNav()

  const goals = useMemo(() => (idx ? computeGoals(idx, progress, 3) : []), [idx, progress])
  const counts = useMemo(() => {
    const c = { active: 0, available: 0, done: 0, total: 0 }
    if (!idx) return c
    for (const t of idx.data.tasks) {
      if (!factionOk(t, progress)) continue
      c.total++
      const s = taskInfo(t, progress, idx).status
      if (s === 'active') c.active++
      else if (s === 'available') c.available++
      else if (s === 'done') c.done++
    }
    return c
  }, [idx, progress])

  if (!idx) return null
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0

  return (
    <div className="page home">
      {!progress.setupDone && (
        <button className="card setup-cta" onClick={() => nav.setTab('settings')}>
          <Gauge size={22} aria-hidden />
          <span><b>初期設定</b><small>レベルと完了済みタスクをまとめて登録</small></span>
          <ChevronRight size={18} aria-hidden />
        </button>
      )}

      <LiveCard />

      <section>
        <div className="section-head">
          <h2 className="label">Objectives<span>今やるべきこと</span></h2>
          <div className="seg" role="radiogroup" aria-label="方針">
            {POLICIES.map((p) => (
              <button key={p.v} role="radio" aria-checked={progress.policy === p.v}
                className={progress.policy === p.v ? 'on' : ''}
                onClick={() => update((x) => ({ ...x, policy: p.v }))}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {goals.length === 0 && <p className="muted">進められるものがありません。レベル・LLを確認してください。</p>}
        <ol className="goals">
          {goals.map((g, i) => {
            const KindIcon = g.kind === 'task' ? ClipboardList : Warehouse
            return (
              <li key={g.kind + g.id}>
                <button className="card goal" onClick={() => (g.kind === 'task' ? nav.goTask(g.id) : nav.goStation(g.id))}>
                  <span className="goal-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="goal-body">
                    <span className="goal-kind"><KindIcon size={13} aria-hidden /> {g.sub}</span>
                    <span className="goal-title">{g.title}</span>
                    <span className="reasons">
                      {g.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                      {g.reasons.map((r) => {
                        const I = REASON_ICON[r.k]
                        return <span key={r.text} className={`reason r-${r.k}`}><I size={13} aria-hidden /><WithTerms text={r.text} /></span>
                      })}
                    </span>
                  </span>
                  <ChevronRight className="goal-go" size={18} aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="hud">
        <div className="card hud-cell">
          <span className="label">Level</span>
          <Stepper value={progress.playerLevel} min={1} max={79}
            onChange={(n) => update((p) => ({ ...p, playerLevel: n }))} />
        </div>
        <button className="card hud-cell" onClick={() => nav.setTab('tasks')}>
          <span className="label">Active</span>
          <b className="big-num">{counts.active}</b>
          <small>受注中</small>
        </button>
        <button className="card hud-cell" onClick={() => nav.setTab('tasks')}>
          <span className="label">Available</span>
          <b className="big-num">{counts.available}</b>
          <small>受注可能</small>
        </button>
        <div className="card hud-cell">
          <span className="label">Progress</span>
          <b className="big-num">{pct}<small>%</small></b>
          <span className="bar"><span style={{ width: `${pct}%` }} /></span>
        </div>
      </section>
    </div>
  )
}
