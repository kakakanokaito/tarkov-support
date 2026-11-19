import { useEffect } from 'react'
import { useApp } from '../AppContext'
import { FLEA_LEVEL, judge, totalCount } from '../logic'
import { ItemIcon, ItemName, rub, Term, VerdictBadge, WithTerms, useNav } from './common'

export default function ItemSheet() {
  const { idx, needs, progress } = useApp()
  const nav = useNav()
  const id = nav.itemId

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && nav.closeItem()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, nav])

  if (!id || !idx) return null
  const it = idx.item.get(id)
  if (!it) return null
  const j = judge(it, needs.get(id), progress)
  const traders = it.sellFor.filter((s) => s.vendor !== 'flea-market').sort((a, b) => b.priceRUB - a.priceRUB)

  return (
    <div className="sheet-backdrop" onClick={nav.closeItem}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close" onClick={nav.closeItem} aria-label="閉じる">×</button>
        <div className="sheet-head">
          <ItemIcon item={it} size={64} />
          <div>
            <ItemName item={it} />
            <div className="muted small">{it.shortName.ja}{it.shortName.en !== it.shortName.ja && ` / ${it.shortName.en}`} ・ {it.width}×{it.height}マス</div>
          </div>
        </div>

        <div className={`judgement v-${j.verdict}`}>
          <VerdictBadge v={j.verdict} big />
          <ul>{j.reasons.map((r) => <li key={r}><WithTerms text={r} /></li>)}</ul>
        </div>

        {j.needs.length > 0 && (
          <section>
            <h3>使い道（合計 {totalCount(j.needs).toLocaleString()}個）</h3>
            <ul className="need-list">
              {j.needs.map((n, i) => (
                <li key={i}>
                  <span className={`src ${n.source}`}>{n.source === 'task' ? 'タスク' : 'ハイドアウト'}</span>
                  <button className="link" onClick={() => {
                    nav.closeItem()
                    if (n.source === 'task') nav.goTask(n.refId)
                    else nav.goStation(n.refId)
                  }}>{n.label}</button>
                  {n.sub && <span className="muted small">（{n.sub}）</span>}
                  <span className="need-count">×{n.count.toLocaleString()}</span>
                  {n.foundInRaid && <Term k="FIR" />}
                  {n.kappa && <span className="tag kappa">Kappa</span>}
                  {n.anyOf && <span className="tag">どれか1種</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3>売値</h3>
          <table className="prices">
            <tbody>
              {traders.slice(0, 3).map((s) => (
                <tr key={s.vendor} className={j.sells.best?.vendor === s.vendor ? 'best' : ''}>
                  <td>{s.vendorName}</td>
                  <td>{rub(s.priceRUB)}</td>
                  <td className="muted">{rub(s.priceRUB / (it.width * it.height))}/マス</td>
                </tr>
              ))}
              {j.sells.flea && (
                <tr className={j.sells.best?.vendor === 'flea-market' ? 'best' : ''}>
                  <td><Term k="フリマ" />{!j.sells.fleaUsable && <small className="muted">（Lv{FLEA_LEVEL}から）</small>}</td>
                  <td>{rub(j.sells.flea.priceRUB)}</td>
                  <td className="muted">手数料別</td>
                </tr>
              )}
              {!traders.length && !j.sells.flea && <tr><td className="muted">売り先がありません</td></tr>}
            </tbody>
          </table>
          {j.sells.best && <p className="small">一番高い売り先：<b>{j.sells.best.vendorName}</b>（{rub(j.sells.best.priceRUB)}）</p>}
        </section>
      </div>
    </div>
  )
}
