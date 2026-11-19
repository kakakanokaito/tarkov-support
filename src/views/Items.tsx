import { useDeferredValue, useMemo, useState } from 'react'
import { useApp } from '../AppContext'
import { itemSearchKey, judge, normalizeQuery, totalCount } from '../logic'
import type { Verdict } from '../logic'
import { ItemIcon, ItemName, rub, VerdictBadge, useNav } from '../components/common'
import { Search } from 'lucide-react'

export default function Items() {
  const { idx, needs, progress } = useApp()
  const nav = useNav()
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q)
  const [onlyFir, setOnlyFir] = useState(false)

  const keys = useMemo(() => (idx ? idx.data.items.map((i) => [i, itemSearchKey(i)] as const) : []), [idx])

  const results = useMemo(() => {
    const nq = normalizeQuery(dq)
    if (!nq) return []
    const exact: typeof keys[number][0][] = []
    const part: typeof keys[number][0][] = []
    for (const [it, key] of keys) {
      const fields = key.split('|')
      if (fields.some((f) => f === nq)) exact.push(it)
      else if (key.includes(nq)) part.push(it)
    }
    // 必要なものを上に
    const rank = (id: string) => (needs.has(id) ? 0 : 1)
    part.sort((a, b) => rank(a.id) - rank(b.id) || a.name.ja.length - b.name.ja.length)
    return [...exact, ...part].slice(0, 60)
  }, [dq, keys, needs])

  const neededList = useMemo(() => {
    if (!idx) return []
    const rows: { id: string; count: number; fir: boolean; verdict: Verdict }[] = []
    for (const [id, ns] of needs) {
      const it = idx.item.get(id)
      if (!it) continue
      const fir = ns.some((n) => n.foundInRaid)
      if (onlyFir && !fir) continue
      rows.push({ id, count: totalCount(ns), fir, verdict: judge(it, ns, progress).verdict })
    }
    return rows.sort((a, b) => Number(b.fir) - Number(a.fir) || b.count - a.count)
  }, [idx, needs, onlyFir, progress])

  if (!idx) return null

  return (
    <div className="page items">
      <label className="search-wrap big">
        <Search size={20} aria-hidden />
        <input
          className="search"
          type="search"
          autoFocus
          placeholder="このアイテム必要？　GPU / LEDX / ボルト"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {q ? (
        <ul className="result-list">
          {results.length === 0 && <li className="muted">見つかりません</li>}
          {results.map((it) => {
            const j = judge(it, needs.get(it.id), progress)
            return (
              <li key={it.id}>
                <button className="result" onClick={() => nav.openItem(it.id)}>
                  <ItemIcon item={it} />
                  <ItemName item={it} />
                  <span className="result-right">
                    <VerdictBadge v={j.verdict} />
                    {j.needs.length > 0 && <small>必要 {totalCount(j.needs)}</small>}
                    {j.needs.length === 0 && j.sells.best && <small>{rub(j.sells.best.priceRUB)}</small>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <>
          <div className="section-head">
            <h2 className="label">Wanted<span>まだ必要なアイテム {neededList.length}</span></h2>
            <button className={onlyFir ? 'chip on' : 'chip'} onClick={() => setOnlyFir((x) => !x)}>FIRのみ</button>
          </div>
          <ul className="mat-grid">
            {neededList.map((r) => {
              const it = idx.item.get(r.id)!
              return (
                <li key={r.id}>
                  <button className="mat" onClick={() => nav.openItem(r.id)}>
                    <ItemIcon item={it} size={36} />
                    <span className="mat-name">{it.name.ja}</span>
                    <span className="mat-count">×{r.count.toLocaleString()}</span>
                    {r.fir && <span className="tag">FIR</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
