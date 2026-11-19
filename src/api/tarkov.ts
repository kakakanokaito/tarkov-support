// tarkov.dev GraphQL API からデータを取得してキャッシュする。
// データは自前で持たず、毎回APIから取る（ワイプ・アップデートに追従するため）。
import { get, set } from 'idb-keyval'
import type { GameData, HideoutStation, Item, Requirement, Task, Trader, GameMap } from '../types'

const ENDPOINT = 'https://api.tarkov.dev/graphql'
const CACHE_KEY = 'gamedata-v1'
export const GAME_MODE = 'regular' // PvP
export const STALE_MS = 6 * 60 * 60 * 1000 // 6時間で再取得

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any

async function gql(query: string, variables: Record<string, unknown>): Promise<Json> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`tarkov.dev API エラー: HTTP ${res.status}`)
  const body = await res.json()
  if (body.errors?.length && !body.data) {
    throw new Error('tarkov.dev API エラー: ' + body.errors.map((e: Json) => e.message).join(' / '))
  }
  if (body.errors?.length) console.warn('tarkov.dev partial errors', body.errors)
  return body.data
}

const FULL_QUERY = /* GraphQL */ `
query Full($lang: LanguageCode, $gm: GameMode) {
  traders(lang: $lang, gameMode: $gm) {
    id name normalizedName imageLink
    levels { level requiredPlayerLevel requiredReputation requiredCommerce }
  }
  maps(lang: $lang, gameMode: $gm) { id name normalizedName }
  tasks(lang: $lang, gameMode: $gm) {
    id name normalizedName wikiLink experience
    trader { id }
    map { id }
    minPlayerLevel kappaRequired lightkeeperRequired factionName
    taskRequirements { task { id } status }
    traderRequirements { trader { id } requirementType compareMethod value }
    objectives {
      id type description optional
      maps { id }
      ... on TaskObjectiveItem { items { id } count foundInRaid }
    }
    finishRewards { traderUnlock { id } }
  }
  hideoutStations(lang: $lang, gameMode: $gm) {
    id name normalizedName imageLink
    levels {
      level constructionTime description
      itemRequirements { item { id } count attributes { type name value } }
      stationLevelRequirements { station { id } level }
      traderRequirements { trader { id } requirementType compareMethod value }
      skillRequirements { name level }
    }
  }
  items(lang: $lang, gameMode: $gm) {
    id name shortName normalizedName iconLink width height basePrice avg24hPrice types
    sellFor { priceRUB vendor { name normalizedName } }
  }
}`

const NAMES_QUERY = /* GraphQL */ `
query Names($lang: LanguageCode, $gm: GameMode) {
  traders(lang: $lang, gameMode: $gm) { id name }
  maps(lang: $lang, gameMode: $gm) { id name }
  tasks(lang: $lang, gameMode: $gm) { id name }
  hideoutStations(lang: $lang, gameMode: $gm) { id name }
  items(lang: $lang, gameMode: $gm) { id name shortName }
}`

// 古いAPIで gameMode 引数が無い場合に備えて、引数なし版も用意
const stripGameMode = (q: string) =>
  q.replace(/, \$gm: GameMode/g, '').replace(/, gameMode: \$gm/g, '')

async function gqlWithFallback(query: string, lang: string): Promise<Json> {
  try {
    return await gql(query, { lang, gm: GAME_MODE })
  } catch (e) {
    if (String(e).includes('gameMode') || String(e).includes('GameMode')) {
      return await gql(stripGameMode(query), { lang })
    }
    throw e
  }
}

function req(r: Json): Requirement {
  return {
    traderId: r.trader?.id ?? '',
    type: r.requirementType ?? 'level',
    compare: r.compareMethod ?? '>=',
    value: Number(r.value ?? r.level ?? 0),
  }
}

export function buildGameData(ja: Json, en: Json, fetchedAt = Date.now()): GameData {
  const enName = (list: Json[] | undefined) => {
    const m = new Map<string, Json>()
    for (const x of list ?? []) m.set(x.id, x)
    return m
  }
  const enTraders = enName(en.traders)
  const enMaps = enName(en.maps)
  const enTasks = enName(en.tasks)
  const enStations = enName(en.hideoutStations)
  const enItems = enName(en.items)

  const traders: Trader[] = (ja.traders ?? []).map((t: Json) => ({
    id: t.id,
    normalizedName: t.normalizedName,
    name: { ja: t.name, en: enTraders.get(t.id)?.name ?? t.name },
    imageLink: t.imageLink,
    levels: t.levels ?? [],
  }))

  const maps: GameMap[] = (ja.maps ?? []).map((m: Json) => ({
    id: m.id,
    normalizedName: m.normalizedName,
    name: { ja: m.name, en: enMaps.get(m.id)?.name ?? m.name },
  }))

  const tasks: Task[] = (ja.tasks ?? []).filter(Boolean).map((t: Json) => ({
    id: t.id,
    normalizedName: t.normalizedName,
    name: { ja: t.name, en: enTasks.get(t.id)?.name ?? t.name },
    traderId: t.trader?.id ?? '',
    mapId: t.map?.id ?? null,
    minPlayerLevel: t.minPlayerLevel ?? 0,
    kappaRequired: !!t.kappaRequired,
    lightkeeperRequired: !!t.lightkeeperRequired,
    factionName: t.factionName ?? 'Any',
    wikiLink: t.wikiLink,
    experience: t.experience ?? 0,
    requires: (t.taskRequirements ?? [])
      .filter((r: Json) => r?.task?.id)
      .map((r: Json) => ({ taskId: r.task.id, status: r.status ?? ['complete'] })),
    traderRequirements: (t.traderRequirements ?? []).map(req),
    objectives: (t.objectives ?? []).filter(Boolean).map((o: Json) => ({
      id: o.id,
      type: o.type,
      description: o.description ?? '',
      optional: !!o.optional,
      mapIds: (o.maps ?? []).map((m: Json) => m.id),
      itemIds: (o.items ?? []).filter(Boolean).map((i: Json) => i.id),
      count: o.count ?? 0,
      foundInRaid: !!o.foundInRaid,
    })),
    unlocksTraderIds: (t.finishRewards?.traderUnlock ?? []).filter(Boolean).map((x: Json) => x.id),
  }))

  const stations: HideoutStation[] = (ja.hideoutStations ?? []).map((s: Json) => ({
    id: s.id,
    normalizedName: s.normalizedName,
    name: { ja: s.name, en: enStations.get(s.id)?.name ?? s.name },
    imageLink: s.imageLink,
    levels: (s.levels ?? [])
      .map((l: Json) => ({
        level: l.level,
        constructionTime: l.constructionTime ?? 0,
        description: l.description ?? '',
        items: (l.itemRequirements ?? [])
          .filter((r: Json) => r?.item?.id)
          .map((r: Json) => ({
            itemId: r.item.id,
            count: r.count ?? r.quantity ?? 1,
            foundInRaid: (r.attributes ?? []).some(
              (a: Json) => /found/i.test(`${a.type}${a.name}`) && String(a.value) === 'true',
            ),
          })),
        stationReqs: (l.stationLevelRequirements ?? [])
          .filter((r: Json) => r?.station?.id)
          .map((r: Json) => ({ stationId: r.station.id, level: r.level })),
        traderReqs: (l.traderRequirements ?? []).map(req),
        skillReqs: (l.skillRequirements ?? []).map((r: Json) => ({ name: r.name, level: r.level })),
      }))
      .sort((a: { level: number }, b: { level: number }) => a.level - b.level),
  }))

  const items: Item[] = (ja.items ?? []).map((i: Json) => {
    const e = enItems.get(i.id)
    return {
      id: i.id,
      normalizedName: i.normalizedName,
      name: { ja: i.name, en: e?.name ?? i.name },
      shortName: { ja: i.shortName ?? '', en: e?.shortName ?? i.shortName ?? '' },
      iconLink: i.iconLink,
      width: i.width || 1,
      height: i.height || 1,
      basePrice: i.basePrice ?? 0,
      avg24hPrice: i.avg24hPrice ?? null,
      types: i.types ?? [],
      sellFor: (i.sellFor ?? [])
        .filter((s: Json) => s?.vendor)
        .map((s: Json) => ({
          vendor: s.vendor.normalizedName,
          vendorName: s.vendor.name,
          priceRUB: s.priceRUB ?? 0,
        })),
    }
  })

  return { fetchedAt, gameMode: GAME_MODE, traders, maps, tasks, stations, items }
}

// ───── 予備の取得先: json.tarkov.dev ─────
// GraphQL API が落ちている時（"GraphQL server unavailable" など）用。
// tarkov.dev が API の元データとして公開している JSON を読み、GraphQL と同じ形に組み直す。
const JSON_BASE = 'https://json.tarkov.dev/' + GAME_MODE + '/'

async function getJson(name: string): Promise<Json> {
  const res = await fetch(JSON_BASE + name)
  if (!res.ok) throw new Error(`json.tarkov.dev エラー: ${name} HTTP ${res.status}`)
  return (await res.json()).data
}

const ids = (xs: Json[] | undefined) => (xs ?? []).filter(Boolean).map((x: Json) => ({ id: typeof x === 'string' ? x : x.id }))

/** 生データ（翻訳キー入り）を、指定言語の GraphQL 応答と同じ形にする */
export function shapeFromJson(raw: Json, tr: Json): Json {
  const L = (k: unknown) => (typeof k === 'string' && k in tr ? tr[k] : k)
  const traders = Object.values(raw.traders ?? {}) as Json[]
  const traderById = new Map(traders.map((t) => [t.id, t]))
  const treq = (r: Json) => ({
    trader: { id: r.trader }, requirementType: r.requirementType ?? 'level',
    compareMethod: r.compareMethod ?? '>=', value: r.value ?? r.level,
  })
  return {
    traders: traders.map((t) => ({
      id: t.id, name: L(t.name), normalizedName: t.normalizedName, imageLink: t.imageLink,
      levels: (t.levels ?? []).map((l: Json) => ({
        level: l.level, requiredPlayerLevel: l.requiredPlayerLevel,
        requiredReputation: l.requiredReputation, requiredCommerce: l.requiredCommerce,
      })),
    })),
    maps: Object.values(raw.maps ?? {}).map((m: Json) => ({ id: m.id, name: L(m.name), normalizedName: m.normalizedName })),
    tasks: Object.values(raw.tasks ?? {}).map((t: Json) => ({
      id: t.id, name: L(t.name), normalizedName: t.normalizedName, wikiLink: t.wikiLink, experience: t.experience,
      trader: { id: t.trader }, map: t.map ? { id: t.map } : null,
      minPlayerLevel: t.minPlayerLevel, kappaRequired: t.kappaRequired, lightkeeperRequired: t.lightkeeperRequired,
      factionName: t.factionName,
      taskRequirements: (t.taskRequirements ?? []).map((r: Json) => ({ task: { id: r.task }, status: r.status })),
      traderRequirements: (t.traderRequirements ?? []).map(treq),
      objectives: (t.objectives ?? []).map((o: Json) => ({
        id: o.id, type: o.type, description: L(o.description), optional: !!o.optional,
        maps: ids(o.maps),
        items: Array.isArray(o.items) ? ids(o.items) : o.item ? ids([o.item]) : undefined,
        count: o.count, foundInRaid: o.foundInRaid,
      })),
      finishRewards: { traderUnlock: ids(t.finishRewards?.traderUnlock) },
    })),
    hideoutStations: Object.values(raw.hideout ?? {}).map((s: Json) => ({
      id: s.id, name: L(s.name), normalizedName: s.normalizedName, imageLink: s.imageLink,
      levels: (s.levels ?? []).map((l: Json) => ({
        level: l.level, constructionTime: l.constructionTime, description: L(l.description),
        itemRequirements: (l.itemRequirements ?? []).map((r: Json) => ({
          item: { id: r.item }, count: r.count,
          attributes: Object.entries(r.attributes ?? {}).map(([k, v]) => ({ type: k, name: k, value: String(v) })),
        })),
        stationLevelRequirements: (l.stationLevelRequirements ?? []).map((r: Json) => ({ station: { id: r.station }, level: r.level })),
        traderRequirements: (l.traderRequirements ?? []).map(treq),
        skillRequirements: (l.skillRequirements ?? []).map((r: Json) => ({ name: L(r.name ?? r.skill), level: r.level })),
      })),
    })),
    items: Object.values(raw.items ?? {}).map((i: Json) => {
      const sellFor = (i.sellToTrader ?? [])
        .filter((p: Json) => traderById.has(p.trader))
        .map((p: Json) => {
          const t = traderById.get(p.trader)
          return { priceRUB: p.priceRUB, vendor: { name: L(t.name), normalizedName: t.normalizedName } }
        })
      const types: string[] = i.types ?? []
      if (i.lastLowPrice && !types.includes('noFlea'))
        sellFor.push({ priceRUB: i.lastLowPrice, vendor: { name: 'Flea Market', normalizedName: 'flea-market' } })
      return {
        id: i.id, name: L(i.name), shortName: L(i.shortName), normalizedName: i.normalizedName, iconLink: i.iconLink,
        width: i.width, height: i.height, basePrice: i.basePrice, avg24hPrice: i.avg24hPrice ?? null, types, sellFor,
      }
    }),
  }
}

async function fetchFromJson(): Promise<{ ja: Json; en: Json }> {
  const names = ['items', 'tasks', 'hideout', 'traders', 'maps'] as const
  const [base, ja, en] = await Promise.all([
    Promise.all(names.map(getJson)),
    Promise.all(names.map((n) => getJson(`${n}_ja`))),
    Promise.all(names.map((n) => getJson(`${n}_en`))),
  ])
  const raw = {
    items: base[0].items, tasks: base[1].tasks, hideout: base[2], traders: base[3], maps: base[4].maps,
  }
  const merge = (xs: Json[]) => Object.assign({}, ...xs)
  return { ja: shapeFromJson(raw, merge(ja)), en: shapeFromJson(raw, merge(en)) }
}

export async function fetchGameData(): Promise<GameData> {
  let ja: Json, en: Json
  try {
    ;[ja, en] = await Promise.all([
      gqlWithFallback(FULL_QUERY, 'ja'),
      gqlWithFallback(NAMES_QUERY, 'en'),
    ])
  } catch (e) {
    console.warn('GraphQL API が使えないので json.tarkov.dev から取得します', e)
    try {
      ;({ ja, en } = await fetchFromJson())
    } catch (e2) {
      console.warn('json.tarkov.dev も失敗', e2)
      throw e
    }
  }
  const data = buildGameData(ja, en)
  await set(CACHE_KEY, data).catch(() => {})
  return data
}

export async function loadCachedGameData(): Promise<GameData | null> {
  try {
    return (await get(CACHE_KEY)) ?? null
  } catch {
    return null
  }
}
