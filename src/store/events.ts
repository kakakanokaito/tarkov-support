// 外部から進捗を自動更新するための入口。
// 次のフェーズの Windows 常駐ソフト（ゲームのログファイルを読む）は、
// この形のイベントを送ってくる想定。タスクIDはゲーム内のIDで、tarkov.dev と同じもの。
import type { Progress } from '../types'

export type ProgressEvent =
  | { type: 'taskStarted'; taskId: string; at: number }
  | { type: 'taskCompleted'; taskId: string; at: number }
  | { type: 'taskFailed'; taskId: string; at: number }
  | { type: 'raidStarted'; map: string; raidId?: string; at: number } // map はログ上のマップ名（tarkov.dev の nameId）
  | { type: 'fleaSold'; itemId: string; count: number; priceRUB: number; at: number }
  | { type: 'playerLevel'; level: number; at: number }
  | { type: 'hideoutLevel'; stationId: string; level: number; at: number }
  | { type: 'traderLevel'; traderId: string; level: number; at: number }

/**
 * イベントを進捗に反映する。companionCursor より古いイベントは反映済みとして飛ばす
 * （手で直した状態を、古いログで上書きしないため）。新しいイベントが無ければ p をそのまま返す。
 */
export function applyEvents(p: Progress, events: ProgressEvent[]): Progress {
  const cursor = p.companionCursor ?? 0
  const fresh = events.filter((e) => e && typeof e.at === 'number' && e.at > cursor).sort((a, b) => a.at - b.at)
  if (!fresh.length) return p
  let next: Progress = { ...p, tasks: { ...p.tasks }, hideout: { ...p.hideout }, traderLL: { ...p.traderLL } }
  for (const e of fresh) {
    switch (e.type) {
      case 'taskStarted':
        if (next.tasks[e.taskId] !== 'done') next.tasks[e.taskId] = 'active'
        break
      case 'taskCompleted':
        next.tasks[e.taskId] = 'done'
        break
      case 'taskFailed':
        delete next.tasks[e.taskId]
        break
      case 'raidStarted':
        next = { ...next, lastRaid: { map: e.map, at: e.at } }
        break
      case 'playerLevel':
        next.playerLevel = Math.max(next.playerLevel, e.level)
        break
      case 'hideoutLevel':
        next.hideout[e.stationId] = e.level
        break
      case 'traderLevel':
        next.traderLL[e.traderId] = e.level
        break
      case 'fleaSold':
        // 売却記録は今は使わない（将来の相場・収支機能用）
        break
    }
  }
  return { ...next, companionCursor: fresh[fresh.length - 1].at, updatedAt: Date.now() }
}
