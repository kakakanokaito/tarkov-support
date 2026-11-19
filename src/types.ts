// tarkov.dev から取得したデータを、アプリで使いやすい形にしたもの。
// 名前は日本語(ja)と英語(en)を両方持つ。

export interface Names {
  ja: string
  en: string
}

export interface Trader {
  id: string
  normalizedName: string
  name: Names
  imageLink?: string
  levels: { level: number; requiredPlayerLevel: number; requiredReputation: number; requiredCommerce: number }[]
}

export interface GameMap {
  id: string
  normalizedName: string
  /** ゲーム内部のマップ名（ログ・常駐ソフトで使う。例: bigmap） */
  nameId?: string
  name: Names
}

export interface Requirement {
  traderId: string
  type: string // level / reputation / spend
  compare: string // >= など
  value: number
}

export interface TaskObjective {
  id: string
  type: string
  description: string
  optional: boolean
  mapIds: string[]
  itemIds: string[]
  count: number
  foundInRaid: boolean
}

export interface Task {
  id: string
  normalizedName: string
  name: Names
  traderId: string
  mapId: string | null
  minPlayerLevel: number
  kappaRequired: boolean
  lightkeeperRequired: boolean
  factionName: string // Any / USEC / BEAR
  wikiLink?: string
  experience: number
  requires: { taskId: string; status: string[] }[]
  traderRequirements: Requirement[]
  objectives: TaskObjective[]
  unlocksTraderIds: string[]
}

export interface HideoutItemReq {
  itemId: string
  count: number
  foundInRaid: boolean
}

export interface HideoutLevel {
  level: number
  constructionTime: number
  description: string
  items: HideoutItemReq[]
  stationReqs: { stationId: string; level: number }[]
  traderReqs: Requirement[]
  skillReqs: { name: string; level: number }[]
}

export interface HideoutStation {
  id: string
  normalizedName: string
  name: Names
  imageLink?: string
  levels: HideoutLevel[]
}

export interface SellOffer {
  vendor: string // normalizedName (flea-market / prapor など)
  vendorName: string
  priceRUB: number
}

export interface Item {
  id: string
  normalizedName: string
  name: Names
  shortName: Names
  iconLink?: string
  width: number
  height: number
  basePrice: number
  avg24hPrice: number | null
  types: string[]
  sellFor: SellOffer[]
}

export interface GameData {
  fetchedAt: number
  gameMode: string
  traders: Trader[]
  maps: GameMap[]
  tasks: Task[]
  stations: HideoutStation[]
  items: Item[]
}

// ───── 進捗（端末間で同期するデータ） ─────

export type TaskState = 'active' | 'done'
export type Policy = 'balance' | 'task' | 'hideout'

export interface Progress {
  v: 1
  updatedAt: number
  playerLevel: number
  faction: 'USEC' | 'BEAR'
  traderLL: Record<string, number> // traderId → LL
  tasks: Record<string, TaskState> // taskId → 状態（無ければ未着手）
  hideout: Record<string, number> // stationId → 建設済みレベル
  policy: Policy
  sellThreshold: number // 1マスあたり何₽以上なら「売ってOK」
  setupDone: boolean
  /** 最後に始めたレイド（常駐ソフトのログ連携で入る） */
  lastRaid?: { map: string; at: number }
  /** 常駐ソフトのイベントをどこまで反映したか（イベントの時刻ms） */
  companionCursor?: number
}
