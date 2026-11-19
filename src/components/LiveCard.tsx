import { useEffect, useState } from 'react'
import { LocateFixed, Radio } from 'lucide-react'
import { useApp } from '../AppContext'
import { mapLabel } from '../store/companion'

export function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function ago(at: number, now: number) {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 60) return `${Math.floor(s)}秒前`
  if (s < 3600) return `${Math.floor(s / 60)}分前`
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`
  return `${Math.floor(s / 86400)}日前`
}

/** 常駐ソフトから届いた現在地（マップ画面ができるまでの最低限の表示） */
export default function LiveCard({ force = false }: { force?: boolean }) {
  const { livePos, liveConnected, data } = useApp()
  const now = useNow(1000)
  if (!livePos) return null
  const age = now - livePos.at
  if (!force && age > 3 * 60 * 60 * 1000) return null
  const fresh = age < 60 * 1000
  return (
    <section className={`card live-card${fresh ? ' fresh' : ''}`} aria-label="現在地">
      <div className="live-compass" aria-hidden>
        <span className="live-n">N</span>
        <svg width="26" height="40" viewBox="0 0 26 40" style={{ transform: `rotate(${livePos.yaw}deg)` }}>
          <path d="M13 2 24 38 13 30 2 38z" fill="currentColor" />
        </svg>
      </div>
      <div className="live-body">
        <span className="label"><LocateFixed size={12} aria-hidden /> Position</span>
        <b className="live-map">{mapLabel(livePos.map, data?.maps)}</b>
        <span className="live-xyz">X {livePos.x.toFixed(1)}　Z {livePos.z.toFixed(1)}　H {livePos.y.toFixed(1)}</span>
      </div>
      <div className="live-meta">
        <span className={`live-dot${liveConnected ? ' on' : ''}`} title={liveConnected ? '受信中' : '未接続'}><Radio size={14} aria-hidden /></span>
        <small>{ago(livePos.at, now)}</small>
      </div>
    </section>
  )
}
