// 目標ナビ：「今やるべきこと」を点数で並べる。
import type { Progress, Task } from '../types'
import type { Index } from './index'
import { descendantCount, factionOk, nextLevel, stationLevel, taskInfo } from './index'

// 施設ごとの「効果の大きさ」と一言説明（normalizedName で引く）
export const STATION_INFO: Record<string, { impact: number; effect: string }> = {
  stash: { impact: 9, effect: 'スタッシュ拡張' },
  'intelligence-center': { impact: 8, effect: 'フリマ手数料・Scav待ち短縮' },
  'bitcoin-farm': { impact: 8, effect: '放置で収入' },
  workbench: { impact: 7, effect: '弾薬クラフト・多くの施設の前提' },
  generator: { impact: 7, effect: '電力・ほぼ全施設の前提' },
  lavatory: { impact: 6, effect: 'クラフト・他施設の前提' },
  medstation: { impact: 5, effect: '体力回復・医薬品クラフト' },
  'nutrition-unit': { impact: 5, effect: '水分/エネルギー回復' },
  'water-collector': { impact: 5, effect: '水の生成' },
  'solar-power': { impact: 5, effect: '燃料消費 半減' },
  heating: { impact: 4, effect: '回復速度アップ' },
  'rest-space': { impact: 4, effect: '回復・ジムの前提' },
  'scav-case': { impact: 4, effect: '投入でアイテム入手' },
  'air-filtering-unit': { impact: 4, effect: 'スキル成長アップ' },
  security: { impact: 3, effect: '他施設の前提' },
  vents: { impact: 3, effect: '他施設の前提' },
  illumination: { impact: 2, effect: '他施設の前提' },
  library: { impact: 3, effect: 'スキル成長アップ' },
  'booze-generator': { impact: 3, effect: '密造酒' },
  'shooting-range': { impact: 2, effect: '射撃練習' },
  gym: { impact: 3, effect: '筋力/持久力トレーニング' },
  'cultist-circle': { impact: 3, effect: '捧げ物でアイテム入手' },
  'weapon-rack': { impact: 1, effect: '武器収納' },
  'hall-of-fame': { impact: 1, effect: 'ドッグタグ展示' },
  'defective-wall': { impact: 2, effect: '他施設の前提' },
  'gear-rack': { impact: 1, effect: '装備収納' },
}

export interface Goal {
  kind: 'task' | 'hideout'
  id: string
  title: string
  sub: string
  score: number
  reasons: Reason[]
  tags: string[]
}

export type ReasonKind = 'unlock' | 'trader' | 'map' | 'effect' | 'station' | 'easy' | 'skill' | 'ready'
export interface Reason { k: ReasonKind; text: string }

const WEIGHT = {
  balance: { task: 1, hideout: 1 },
  task: { task: 1.6, hideout: 0.55 },
  hideout: { task: 0.55, hideout: 1.6 },
}

export function computeGoals(idx: Index, p: Progress, limit = 3): Goal[] {
  const goals: Goal[] = []
  const w = WEIGHT[p.policy] ?? WEIGHT.balance

  // 進められるタスク（受注中＋受注可能）。レベル・LLで無理なものはここに入らない。
  const open: Task[] = []
  for (const t of idx.data.tasks) {
    if (!factionOk(t, p)) continue
    const info = taskInfo(t, p, idx)
    if (info.status === 'available' || (info.status === 'active' && info.lockReasons.length === 0)) open.push(t)
  }
  const perMap = new Map<string, number>()
  for (const t of open) if (t.mapId) perMap.set(t.mapId, (perMap.get(t.mapId) ?? 0) + 1)

  for (const t of open) {
    const reasons: Reason[] = []
    const tags: string[] = []
    let score = 10
    const direct = (idx.children.get(t.id) ?? []).filter((c) => {
      const ct = idx.task.get(c)
      return ct && factionOk(ct, p) && p.tasks[c] !== 'done'
    })
    const desc = descendantCount(t.id, idx)
    if (direct.length) {
      score += direct.length * 4 + Math.min(desc, 25) * 0.8
      reasons.push({ k: 'unlock', text: `次のタスク ${direct.length}件解放` + (desc > direct.length ? ` ／ 計${desc}件` : '') })
    }
    if (t.unlocksTraderIds.length) {
      score += 15
      reasons.push({ k: 'trader', text: `${t.unlocksTraderIds.map((id) => idx.traderName.get(id)).join('・')} 解放` })
    }
    const same = t.mapId ? (perMap.get(t.mapId) ?? 1) - 1 : 0
    if (same > 0) {
      score += same * 3
      reasons.push({ k: 'map', text: `${idx.mapName.get(t.mapId!)}で他${same}件も同時に` })
    }
    if (t.kappaRequired) {
      score += 3
      tags.push('Kappa')
    }
    if (p.tasks[t.id] === 'active') {
      score += 4
      tags.push('受注中')
    }
    if (!reasons.length) reasons.push({ k: 'ready', text: '今すぐ受けられる' })
    goals.push({
      kind: 'task',
      id: t.id,
      title: t.name.ja,
      sub: `${idx.traderName.get(t.traderId) ?? ''}${t.mapId ? ' ・ ' + idx.mapName.get(t.mapId) : ''}`,
      score: score * w.task,
      reasons,
      tags,
    })
  }

  // 建てられるハイドアウト施設
  for (const s of idx.data.stations) {
    const nl = nextLevel(s, p, idx)
    if (!nl || !nl.buildable) continue
    const info = STATION_INFO[s.normalizedName] ?? { impact: 2, effect: '' }
    const reasons: Reason[] = []
    let score = 8 + info.impact * 3
    if (info.effect) reasons.push({ k: 'effect', text: info.effect })
    // この施設レベルを前提にしている他の施設レベル
    const unlocked = idx.data.stations.filter((o) =>
      o.levels.some(
        (l) =>
          l.stationReqs.some((r) => r.stationId === s.id && r.level === nl.level.level) &&
          l.level === stationLevel(o, p) + 1,
      ),
    )
    if (unlocked.length) {
      score += unlocked.length * 5
      reasons.push({ k: 'station', text: `${unlocked.map((o) => o.name.ja).join('・')} が建設可能に` })
    }
    const itemKinds = nl.level.items.filter((i) => !/roubles|dollars|euros/.test(idx.item.get(i.itemId)?.normalizedName ?? '')).length
    if (itemKinds <= 2) {
      score += 4
      reasons.push({ k: 'easy', text: itemKinds === 0 ? '素材不要' : `素材 ${itemKinds}種類だけ` })
    }
    if (nl.level.skillReqs.length) {
      reasons.push({ k: 'skill', text: nl.level.skillReqs.map((r) => `${r.name} ${r.level}`).join('、') })
    }
    goals.push({
      kind: 'hideout',
      id: s.id,
      title: `${s.name.ja} を Lv${nl.level.level} に`,
      sub: 'ハイドアウト',
      score: score * w.hideout,
      reasons,
      tags: [],
    })
  }

  goals.sort((a, b) => b.score - a.score)
  if (p.policy !== 'balance' || limit < 2) return goals.slice(0, limit)
  // バランス：タスクとハイドアウトが両方あれば最低1つずつ入れる
  const top = goals.slice(0, limit)
  for (const kind of ['task', 'hideout'] as const) {
    if (!top.some((g) => g.kind === kind)) {
      const best = goals.find((g) => g.kind === kind)
      if (best) top[top.length - 1] = best
    }
  }
  return top.sort((a, b) => b.score - a.score)
}
