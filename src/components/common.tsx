import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { Item } from '../types'
import type { Verdict } from '../logic'
import { VERDICT_LABEL } from '../logic'
import { Archive, Ban, Coins, Minus, Plus, Trash2 } from 'lucide-react'

// ───── 用語辞典（初心者向けの短い説明） ─────
export const GLOSSARY: Record<string, string> = {
  FIR: 'Found in Raid の略。レイド内で拾った（見つけた）状態のアイテム。買った物は対象外なので、FIRが必要なタスク品は売らずに持っておく。',
  LL: 'Loyalty Level（ロイヤリティレベル）。トレーダーとの信頼度。上げると買える物やタスクが増える。プレイヤーレベル・評判・取引額で上がる。',
  Kappa: 'Kappaコンテナ。特定のタスクをすべて終えるともらえる最大級の安全コンテナ。Kappa必須タスクのアイテムは長期的に必要。',
  フリマ: 'フリーマーケット。プレイヤー同士の売買所。PvPではレベル15から使える。出品には手数料がかかる。',
  ハイドアウト: '自分の拠点。施設を建てると回復・クラフト・お金稼ぎなどができるようになる。',
  LV: '施設のレベル。上げるたびに素材が必要。',
}

export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="term">
      <button className="term-btn" onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
        {children ?? k}
      </button>
      {open && (
        <span className="term-pop" onClick={() => setOpen(false)}>
          <b>{k}</b>：{GLOSSARY[k] ?? '説明準備中'}
        </span>
      )}
    </span>
  )
}

/** 文章中の FIR / LL / Kappa を用語リンクにする */
export function WithTerms({ text }: { text: string }) {
  const parts = text.split(/(FIR|LL|Kappa|フリマ)/g)
  return (
    <>
      {parts.map((s, i) => (GLOSSARY[s] ? <Term key={i} k={s} /> : <span key={i}>{s}</span>))}
    </>
  )
}

// ───── 画面間の移動（アイテム詳細を開く・タスクへ飛ぶ） ─────
export type Tab = 'home' | 'tasks' | 'hideout' | 'items' | 'settings'

interface Nav {
  tab: Tab
  setTab: (t: Tab) => void
  openItem: (id: string) => void
  itemId: string | null
  closeItem: () => void
  focusTask: string | null
  goTask: (id: string) => void
  focusStation: string | null
  goStation: (id: string) => void
}
export const NavCtx = createContext<Nav | null>(null)
export const useNav = () => useContext(NavCtx)!

// ───── 小物 ─────
export function ItemIcon({ item, size = 40 }: { item?: Item; size?: number }) {
  if (!item?.iconLink) return <span className="icon-ph" style={{ width: size, height: size }} />
  return <img className="item-icon" src={item.iconLink} alt="" width={size} height={size} loading="lazy" />
}

export function ItemName({ item }: { item: Item }) {
  const same = item.name.ja === item.name.en
  return (
    <span className="item-name">
      <span className="ja">{item.name.ja}</span>
      {!same && <span className="en">{item.name.en}</span>}
    </span>
  )
}

const VERDICT_ICON = { keep: Ban, hold: Archive, sell: Coins, trash: Trash2 }

export function VerdictBadge({ v, big }: { v: Verdict; big?: boolean }) {
  const I = VERDICT_ICON[v]
  return (
    <span className={`verdict v-${v}${big ? ' big' : ''}`}>
      <I size={big ? 18 : 13} strokeWidth={2.2} aria-hidden />
      {VERDICT_LABEL[v]}
    </span>
  )
}

export const rub = (n: number) => `${Math.round(n).toLocaleString()}₽`

export function Stepper({ value, min, max, onChange, label, step = 1 }: {
  value: number; min: number; max: number; onChange: (n: number) => void; label?: string; step?: number
}) {
  return (
    <span className="stepper">
      <button aria-label="減らす" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}><Minus size={16} /></button>
      <span className="stepper-val">{label ?? value}</span>
      <button aria-label="増やす" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}><Plus size={16} /></button>
    </span>
  )
}
