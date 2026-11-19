import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../AppContext'
import { nextLevel, stationLevel, totalCount } from '../logic'
import { STATION_INFO } from '../logic/goals'
import { ItemIcon, Stepper, useNav } from '../components/common'
import { Hammer, Layers, Lock, Wrench, CheckCheck } from 'lucide-react'

export default function Hideout() {
  const { idx, progress, update, needs } = useApp()
  const nav = useNav()
  const [showTotal, setShowTotal] = useState(false)
  const focusRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (nav.focusStation) setTimeout(() => focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }, [nav.focusStation])

  const totals = useMemo(() => {
    const rows: { itemId: string; count: number; soon: number }[] = []
    for (const [itemId, ns] of needs) {
      const h = ns.filter((n) => n.source === 'hideout')
      if (!h.length) continue
      rows.push({ itemId, count: totalCount(h), soon: totalCount(h.filter((n) => n.soonLevel)) })
    }
    return rows.sort((a, b) => b.soon - a.soon || b.count - a.count)
  }, [needs])

  if (!idx) return null
  const stations = [...idx.data.stations].sort((a, b) => {
    const ba = nextLevel(a, progress, idx)?.buildable ? 0 : 1
    const bb = nextLevel(b, progress, idx)?.buildable ? 0 : 1
    return ba - bb || a.name.ja.localeCompare(b.name.ja, 'ja')
  })

  const setLevel = (id: string, lv: number) =>
    update((p) => ({ ...p, hideout: { ...p.hideout, [id]: lv } }))

  return (
    <div className="page hideout">
      <div className="section-head">
        <h2 className="label">Hideout<span>ハイドアウト</span></h2>
        <button className={showTotal ? 'chip on' : 'chip'} onClick={() => setShowTotal((s) => !s)}>
          <Layers size={15} />素材の合計
        </button>
      </div>

      {showTotal && (
        <div className="card">
          <h3 className="label">Materials<span>全施設の残り（次＝次のレベル分）</span></h3>
          <ul className="mat-grid">
            {totals.map((r) => {
              const it = idx.item.get(r.itemId)
              return (
                <li key={r.itemId}>
                  <button className="mat" onClick={() => nav.openItem(r.itemId)}>
                    <ItemIcon item={it} size={36} />
                    <span className="mat-name">{it?.name.ja ?? r.itemId}</span>
                    <span className="mat-count">×{r.count.toLocaleString()}{r.soon > 0 && <small>（次 {r.soon.toLocaleString()}）</small>}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="station-grid">
        {stations.map((s) => {
          const cur = stationLevel(s, progress)
          const max = s.levels.length ? Math.max(...s.levels.map((l) => l.level)) : 0
          const nl = nextLevel(s, progress, idx)
          const info = STATION_INFO[s.normalizedName]
          return (
            <div key={s.id} className={`card station${nav.focusStation === s.id ? ' focus' : ''}`}
              ref={nav.focusStation === s.id ? focusRef : undefined}>
              <div className="station-head">
                <div>
                  <div className="station-name">{s.name.ja}</div>
                  {s.name.en !== s.name.ja && <div className="en small">{s.name.en}</div>}
                </div>
                <Stepper value={cur} min={0} max={max} label={`Lv${cur}/${max}`} onChange={(n) => setLevel(s.id, n)} />
              </div>
              {info?.effect && <p className="muted small">{info.effect}</p>}
              {!nl ? (
                <p className="done-msg"><CheckCheck size={16} /> MAX</p>
              ) : (
                <>
                  <div className="next-head">
                    <span className="label">Next Lv{nl.level.level}</span>
                    {nl.buildable ? <span className="tag ok"><Hammer size={12} />建設可</span> : <span className="tag ng"><Lock size={12} />条件未達</span>}
                  </div>
                  {nl.reasons.length > 0 && <p className="lock"><Lock size={14} aria-hidden /> {nl.reasons.join(' ／ ')}</p>}
                  {nl.level.skillReqs.length > 0 && (
                    <p className="muted small"><Wrench size={13} aria-label="スキル" /> {nl.level.skillReqs.map((r) => `${r.name} ${r.level}`).join('、')}</p>
                  )}
                  <ul className="req-items">
                    {nl.level.items.map((r) => {
                      const it = idx.item.get(r.itemId)
                      return (
                        <li key={r.itemId}>
                          <button className="mat" onClick={() => nav.openItem(r.itemId)}>
                            <ItemIcon item={it} size={32} />
                            <span className="mat-name">{it?.name.ja ?? r.itemId}</span>
                            <span className="mat-count">×{r.count.toLocaleString()}</span>
                            {r.foundInRaid && <span className="tag">FIR</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
