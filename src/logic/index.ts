// ゲームデータ＋進捗から、画面に出す判断（タスクの状態・必要アイテム・今やるべきこと）を計算する。
import type { GameData, HideoutLevel, HideoutStation, Item, Progress, Task } from '../types'

export interface Index {
  data: GameData
  task: Map<string, Task>
  item: Map<string, Item>
  station: Map<string, HideoutStation>
  traderName: Map<string, string>
  mapName: Map<string, string>
  children: Map<string, string[]> // taskId → このタスクを前提にするタスク
  stationUnlocks: Map<string, number> // `${stationId}:${level}` → それを前提にする施設レベル数
}

export function buildIndex(data: GameData): Index {
  const task = new Map(data.tasks.map((t) => [t.id, t]))
  const children = new Map<string, string[]>()
  for (const t of data.tasks) {
    for (const r of t.requires) {
      if (!children.has(r.taskId)) children.set(r.taskId, [])
      children.get(r.taskId)!.push(t.id)
    }
  }
  const stationUnlocks = new Map<string, number>()
  for (const s of data.stations)
    for (const l of s.levels)
      for (const r of l.stationReqs) {
        const k = `${r.stationId}:${r.level}`
        stationUnlocks.set(k, (stationUnlocks.get(k) ?? 0) + 1)
      }
  return {
    data,
    task,
    item: new Map(data.items.map((i) => [i.id, i])),
    station: new Map(data.stations.map((s) => [s.id, s])),
    traderName: new Map(data.traders.map((t) => [t.id, t.name.ja])),
    mapName: new Map(data.maps.map((m) => [m.id, m.name.ja])),
    children,
    stationUnlocks,
  }
}

// ───── タスク ─────

export const factionOk = (t: Task, p: Progress) =>
  !t.factionName || t.factionName === 'Any' || t.factionName === p.faction

export type TaskStatus = 'done' | 'active' | 'available' | 'locked'

export interface TaskInfo {
  status: TaskStatus
  lockReasons: string[]
  /** ロック理由が「前提タスク」だけで、その前提がすべて受注中/完了済み → もうすぐ解放 */
  soon: boolean
}

function reqOk(state: string | undefined, status: string[]) {
  // status は ['complete'] や ['active'] など。完了で解放が基本。
  if (status.includes('complete') && state === 'done') return true
  if (status.includes('active') && (state === 'active' || state === 'done')) return true
  if (status.includes('failed')) return true // 失敗分岐は判定しない（ブロックしない）
  return false
}

export function taskInfo(t: Task, p: Progress, idx: Index): TaskInfo {
  const state = p.tasks[t.id]
  if (state === 'done') return { status: 'done', lockReasons: [], soon: false }
  const reasons: string[] = []
  let onlyTaskLocks = true
  let allPrereqsProgressing = true
  for (const r of t.requires) {
    const pre = idx.task.get(r.taskId)
    if (!pre || !factionOk(pre, p)) continue
    if (!reqOk(p.tasks[r.taskId], r.status)) {
      reasons.push(`前提: ${pre.name.ja}`)
      if (p.tasks[r.taskId] !== 'active') allPrereqsProgressing = false
    }
  }
  if (t.minPlayerLevel > p.playerLevel) {
    reasons.push(`レベル${t.minPlayerLevel}が必要`)
    onlyTaskLocks = false
  }
  for (const r of t.traderRequirements) {
    if (r.type === 'level' && (p.traderLL[r.traderId] ?? 1) < r.value) {
      reasons.push(`${idx.traderName.get(r.traderId) ?? '?'} LL${r.value}が必要`)
      onlyTaskLocks = false
    }
  }
  if (state === 'active') return { status: 'active', lockReasons: reasons, soon: false }
  if (reasons.length) {
    return { status: 'locked', lockReasons: reasons, soon: onlyTaskLocks && allPrereqsProgressing }
  }
  return { status: 'available', lockReasons: [], soon: false }
}

/** このタスクと、その前提タスクすべて（再帰） */
export function ancestors(taskId: string, idx: Index, p: Progress): Set<string> {
  const out = new Set<string>()
  const stack = [taskId]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    const t = idx.task.get(id)
    if (!t || !factionOk(t, p)) continue
    out.add(id)
    for (const r of t.requires) {
      if (r.status.includes('complete') || r.status.includes('active')) stack.push(r.taskId)
    }
  }
  return out
}

/** このタスクを完了すると（いずれ）解放されるタスクの数 */
export function descendantCount(taskId: string, idx: Index, cap = 60): number {
  const seen = new Set<string>()
  const stack = [...(idx.children.get(taskId) ?? [])]
  while (stack.length && seen.size < cap) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(idx.children.get(id) ?? []))
  }
  return seen.size
}

/** トレーダー内でのタスクの並び順（前提の深さ順） */
export function taskDepths(idx: Index): Map<string, number> {
  const depth = new Map<string, number>()
  const visit = (id: string, guard: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!
    if (guard.has(id)) return 0
    guard.add(id)
    const t = idx.task.get(id)
    let d = 0
    for (const r of t?.requires ?? []) d = Math.max(d, visit(r.taskId, guard) + 1)
    depth.set(id, d)
    return d
  }
  for (const t of idx.data.tasks) visit(t.id, new Set())
  return depth
}

// ───── ハイドアウト ─────

/** 建設済みレベル。スタッシュは最初からLv1ある */
export const stationLevel = (s: HideoutStation, p: Progress) =>
  p.hideout[s.id] ?? (s.normalizedName === 'stash' ? 1 : 0)

export interface LevelCheck {
  level: HideoutLevel
  buildable: boolean
  reasons: string[]
}

export function nextLevel(s: HideoutStation, p: Progress, idx: Index): LevelCheck | null {
  const cur = stationLevel(s, p)
  const level = s.levels.find((l) => l.level === cur + 1)
  if (!level) return null
  const reasons: string[] = []
  for (const r of level.stationReqs) {
    const rs = idx.station.get(r.stationId)
    if ((rs ? stationLevel(rs, p) : 0) < r.level)
      reasons.push(`${idx.station.get(r.stationId)?.name.ja ?? '?'} Lv${r.level}`)
  }
  for (const r of level.traderReqs) {
    if (r.type === 'level' && (p.traderLL[r.traderId] ?? 1) < r.value)
      reasons.push(`${idx.traderName.get(r.traderId) ?? '?'} LL${r.value}`)
  }
  return { level, buildable: reasons.length === 0, reasons }
}

// ───── 必要アイテム ─────

export interface Need {
  source: 'task' | 'hideout'
  label: string // タスク名 or 施設名 LvN
  sub?: string // トレーダー名など
  refId: string
  count: number
  foundInRaid: boolean
  kappa: boolean
  anyOf: boolean // 複数アイテムのどれか1つでよい
  soonLevel?: boolean // 次に建てる施設レベル
}

export function buildNeeds(idx: Index, p: Progress): Map<string, Need[]> {
  const needs = new Map<string, Need[]>()
  const add = (itemId: string, n: Need) => {
    if (!needs.has(itemId)) needs.set(itemId, [])
    needs.get(itemId)!.push(n)
  }
  for (const t of idx.data.tasks) {
    if (p.tasks[t.id] === 'done' || !factionOk(t, p)) continue
    for (const o of t.objectives) {
      if (!(o.type === 'giveItem' || o.type === 'plantItem')) continue
      if (!o.itemIds.length || o.count <= 0) continue
      for (const itemId of o.itemIds) {
        add(itemId, {
          source: 'task',
          label: t.name.ja,
          sub: idx.traderName.get(t.traderId),
          refId: t.id,
          count: o.count,
          foundInRaid: o.foundInRaid,
          kappa: t.kappaRequired,
          anyOf: o.itemIds.length > 1,
        })
      }
    }
  }
  for (const s of idx.data.stations) {
    const cur = stationLevel(s, p)
    for (const l of s.levels) {
      if (l.level <= cur) continue
      for (const r of l.items) {
        add(r.itemId, {
          source: 'hideout',
          label: `${s.name.ja} Lv${l.level}`,
          refId: s.id,
          count: r.count,
          foundInRaid: r.foundInRaid,
          kappa: false,
          anyOf: false,
          soonLevel: l.level === cur + 1,
        })
      }
    }
  }
  return needs
}

export const totalCount = (ns: Need[]) => ns.reduce((a, n) => a + n.count, 0)

// ───── アイテム4分類 ─────

export type Verdict = 'keep' | 'hold' | 'sell' | 'trash'

export const VERDICT_LABEL: Record<Verdict, string> = {
  keep: '売ってはダメ',
  hold: '取っておく',
  sell: '売ってOK',
  trash: '捨ててOK',
}

export const FLEA_LEVEL = 15

export interface BestSell {
  vendorName: string
  vendor: string
  priceRUB: number
}

export function bestSells(item: Item, p: Progress) {
  const traders = item.sellFor.filter((s) => s.vendor !== 'flea-market' && s.priceRUB > 0)
  const bestTrader = traders.sort((a, b) => b.priceRUB - a.priceRUB)[0] ?? null
  const flea = item.sellFor.find((s) => s.vendor === 'flea-market' && s.priceRUB > 0) ?? null
  const fleaUsable = !!flea && p.playerLevel >= FLEA_LEVEL
  let best: BestSell | null = bestTrader
  if (fleaUsable && flea && (!best || flea.priceRUB > best.priceRUB)) best = flea
  return { bestTrader, flea, fleaUsable, best }
}

const CURRENCY = new Set(['roubles', 'dollars', 'euros'])

export interface Judgement {
  verdict: Verdict
  reasons: string[]
  needs: Need[]
  perSlot: number
  sells: ReturnType<typeof bestSells>
}

export function judge(item: Item, needs: Need[] | undefined, p: Progress): Judgement {
  const ns = needs ?? []
  const sells = bestSells(item, p)
  const slots = item.width * item.height
  const perSlot = sells.best ? Math.round(sells.best.priceRUB / slots) : 0
  const reasons: string[] = []
  const fir = ns.filter((n) => n.source === 'task' && n.foundInRaid)
  const kappa = ns.filter((n) => n.kappa)
  const hideout = ns.filter((n) => n.source === 'hideout')
  const otherTask = ns.filter((n) => n.source === 'task' && !n.foundInRaid && !n.kappa)

  if (CURRENCY.has(item.normalizedName)) {
    return { verdict: ns.length ? 'hold' : 'sell', reasons: ['通貨'], needs: ns, perSlot, sells }
  }
  if (fir.length) reasons.push(`タスク提出 ${totalCount(fir)}個（FIR）`)
  if (kappa.length && !fir.length) reasons.push(`Kappa用 ${totalCount(kappa)}個`)
  if (hideout.length) reasons.push(`ハイドアウト ${totalCount(hideout)}個`)
  if (fir.length || kappa.length || hideout.length) {
    if (otherTask.length) reasons.push(`他タスク ${totalCount(otherTask)}個`)
    return { verdict: 'keep', reasons, needs: ns, perSlot, sells }
  }
  if (otherTask.length) {
    reasons.push(`タスク ${totalCount(otherTask)}個（購入でも可）`)
    return { verdict: 'hold', reasons, needs: ns, perSlot, sells }
  }
  reasons.push('使い道なし')
  if (perSlot >= p.sellThreshold) {
    reasons.push(`${perSlot.toLocaleString()}₽ / マス`)
    return { verdict: 'sell', reasons, needs: ns, perSlot, sells }
  }
  reasons.push(
    perSlot > 0
      ? `${perSlot.toLocaleString()}₽ / マス（安い）`
      : '売り先なし',
  )
  return { verdict: 'trash', reasons, needs: ns, perSlot, sells }
}

// ───── 検索 ─────

export function normalizeQuery(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[\s・\-_.。、"'()（）]/g, '')
}

export function itemSearchKey(i: Item): string {
  return [i.name.ja, i.name.en, i.shortName.ja, i.shortName.en, i.normalizedName]
    .map(normalizeQuery)
    .join('|')
}
