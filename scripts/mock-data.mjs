// 動作確認用のダミーデータ（tarkov.dev のレスポンスと同じ形）。
// 本物のデータではありません。画面確認用に、少数のトレーダー・タスク・施設・アイテムだけを入れています。
const tr = (id, ja, en, n, lv = 4) => ({
  id, name: ja, en, normalizedName: n, imageLink: '',
  levels: Array.from({ length: lv }, (_, i) => ({ level: i + 1, requiredPlayerLevel: [1, 15, 26, 36][i], requiredReputation: 0, requiredCommerce: 0 })),
})
const traders = [
  tr('t-prapor', 'プラパー', 'Prapor', 'prapor'),
  tr('t-thera', 'セラピスト', 'Therapist', 'therapist'),
  tr('t-skier', 'スキアー', 'Skier', 'skier'),
  tr('t-pk', 'ピースキーパー', 'Peacekeeper', 'peacekeeper'),
  tr('t-mech', 'メカニック', 'Mechanic', 'mechanic'),
  tr('t-ragman', 'ラグマン', 'Ragman', 'ragman'),
  tr('t-jaeger', 'イェーガー', 'Jaeger', 'jaeger'),
  tr('t-fence', 'フェンス', 'Fence', 'fence', 1),
]
const maps = [
  { id: 'm-customs', name: 'カスタム', en: 'Customs', normalizedName: 'customs' },
  { id: 'm-woods', name: 'ウッズ', en: 'Woods', normalizedName: 'woods' },
  { id: 'm-factory', name: 'ファクトリー', en: 'Factory', normalizedName: 'factory' },
  { id: 'm-inter', name: 'インターチェンジ', en: 'Interchange', normalizedName: 'interchange' },
]
const item = (id, ja, en, sja, sen, n, w, h, base, flea, sells) => ({
  id, name: ja, en, shortName: sja, enShort: sen, normalizedName: n, iconLink: '', width: w, height: h,
  basePrice: base, avg24hPrice: flea, types: [],
  sellFor: [
    ...sells.map(([v, vn, p]) => ({ priceRUB: p, vendor: { name: vn, normalizedName: v } })),
    ...(flea ? [{ priceRUB: flea, vendor: { name: 'フリーマーケット', normalizedName: 'flea-market' } }] : []),
  ],
})
const items = [
  item('i-gpu', 'グラフィックカード', 'Graphics card', 'GPU', 'GPU', 'graphics-card', 2, 1, 100000, 480000, [['therapist', 'セラピスト', 210000], ['mechanic', 'メカニック', 190000]]),
  item('i-ledx', 'LEDX皮膚透過照明装置', 'LEDX Skin Transilluminator', 'LEDX', 'LEDX', 'ledx-skin-transilluminator', 1, 1, 300000, 820000, [['therapist', 'セラピスト', 380000]]),
  item('i-bolts', 'ボルト', 'Bolts', 'ボルト', 'Bolts', 'bolts', 1, 1, 8000, 22000, [['mechanic', 'メカニック', 9500]]),
  item('i-salewa', 'サレワ救急キット', 'Salewa first aid kit', 'サレワ', 'Salewa', 'salewa-first-aid-kit', 1, 2, 10000, 26000, [['therapist', 'セラピスト', 12000]]),
  item('i-gas', 'ガスアナライザー', 'Gas analyzer', 'ガスアナ', 'GasAn', 'gas-analyzer', 1, 2, 9000, 24000, [['therapist', 'セラピスト', 11000]]),
  item('i-wire', 'ワイヤーの束', 'Bundle of wires', 'ワイヤー', 'Wires', 'bundle-of-wires', 1, 1, 4500, 11000, [['mechanic', 'メカニック', 5500]]),
  item('i-flash', 'セキュアフラッシュドライブ', 'Secure Flash drive', 'フラッシュ', 'Flash drive', 'secure-flash-drive', 1, 1, 15000, 40000, [['therapist', 'セラピスト', 17000]]),
  item('i-tushonka', 'ビーフシチュー缶（大）', 'Can of beef stew (Large)', 'トゥションカ', 'Tushonka', 'can-of-beef-stew-large', 1, 1, 7000, 18000, [['jaeger', 'イェーガー', 8000]]),
  item('i-matches', 'マッチ', 'Matches', 'マッチ', 'Matches', 'matches', 1, 1, 900, 3000, [['therapist', 'セラピスト', 1100]]),
  item('i-screw', 'ネジ', 'Screw nuts', 'ネジ', 'Nuts', 'screw-nuts', 1, 1, 4000, 9000, [['mechanic', 'メカニック', 5000]]),
  item('i-toilet', 'トイレットペーパー', 'Toilet paper', 'TP', 'TP', 'toilet-paper', 1, 2, 2000, 5500, [['therapist', 'セラピスト', 2400]]),
  item('i-roubles', 'ルーブル', 'Roubles', 'RUB', 'RUB', 'roubles', 1, 1, 1, 0, []),
  item('i-akm', 'AKM 7.62x39 アサルトライフル', 'Kalashnikov AKM 7.62x39 assault rifle', 'AKM', 'AKM', 'akm', 4, 2, 30000, 0, [['prapor', 'プラパー', 26000]]),
  item('i-hose', '波形ホース', 'Corrugated hose', 'ホース', 'Hose', 'corrugated-hose', 2, 1, 12000, 30000, [['mechanic', 'メカニック', 14000]]),
  item('i-dogtag', 'ドッグタグ BEAR', 'Dogtag BEAR', 'BEAR', 'BEAR', 'dogtag-bear', 1, 1, 100, 0, [['fence', 'フェンス', 60]]),
  item('i-cola', 'コーラ', 'Can of Max Energy', 'コーラ', 'Max', 'max-energy', 1, 1, 3000, 0, [['therapist', 'セラピスト', 1500]]),
]
const obj = (id, type, desc, extra = {}) => ({ id, type, description: desc, optional: false, maps: [], ...extra })
const task = (id, ja, en, trader, map, lv, reqs, objectives, opts = {}) => ({
  id, name: ja, en, normalizedName: id, wikiLink: 'https://escapefromtarkov.fandom.com/', experience: 1000,
  trader: { id: trader }, map: map ? { id: map } : null, minPlayerLevel: lv, kappaRequired: !!opts.kappa,
  lightkeeperRequired: false, factionName: opts.faction ?? 'Any',
  taskRequirements: reqs.map((r) => ({ task: { id: r }, status: ['complete'] })),
  traderRequirements: opts.ll ? [{ trader: { id: trader }, requirementType: 'level', compareMethod: '>=', value: opts.ll }] : [],
  objectives, finishRewards: { traderUnlock: opts.unlock ? [{ id: opts.unlock }] : [] },
})
const tasks = [
  task('q-debut', 'デビュー', 'Debut', 't-prapor', 'm-customs', 1, [], [obj('o1', 'shoot', 'カスタムでScavを5人倒す', { maps: [{ id: 'm-customs' }] })], { kappa: true }),
  task('q-search', '捜索ミッション', 'Search Mission', 't-prapor', 'm-woods', 2, ['q-debut'], [obj('o2', 'visit', 'ウッズで行方不明の部隊を探す', { maps: [{ id: 'm-woods' }] })], { kappa: true }),
  task('q-checking', 'チェックイン', 'Checking', 't-prapor', 'm-customs', 3, ['q-debut'], [obj('o3', 'findQuestItem', 'カスタムで小包を見つける')], { kappa: true }),
  task('q-shootout', '撃ち合いピクニック', 'Shootout Picnic', 't-prapor', 'm-woods', 5, ['q-search'], [obj('o4', 'shoot', 'ウッズでScavを15人倒す')], { kappa: true }),
  task('q-shortage', '物資不足', 'Shortage', 't-thera', null, 2, [], [
    obj('o5a', 'findItem', 'レイド内でサレワを3個見つける', { items: [{ id: 'i-salewa' }], count: 3, foundInRaid: true }),
    obj('o5', 'giveItem', 'サレワを3個渡す', { items: [{ id: 'i-salewa' }], count: 3, foundInRaid: true }),
  ], { kappa: true }),
  task('q-sanitary1', '衛生基準 パート1', 'Sanitary Standards - Part 1', 't-thera', 'm-customs', 5, ['q-shortage'], [
    obj('o6', 'giveItem', 'ガスアナライザーを1個渡す', { items: [{ id: 'i-gas' }], count: 1, foundInRaid: true }),
  ], { kappa: true }),
  task('q-pharma', '薬剤師', 'Pharmacist', 't-thera', 'm-customs', 10, ['q-sanitary1'], [obj('o7', 'visit', 'カスタムの寮で医療ケースを見つける')], { kappa: true }),
  task('q-intro', '紹介', 'Introduction', 't-mech', 'm-woods', 1, [], [obj('o8', 'visit', 'ウッズでイェーガーのキャンプを見つける')], { unlock: 't-jaeger', kappa: true }),
  task('q-gunsmith1', 'ガンスミス パート1', 'Gunsmith - Part 1', 't-mech', null, 2, [], [obj('o9', 'buildWeapon', '指定の条件でMP-133を改造する')], { kappa: true }),
  task('q-gunsmith2', 'ガンスミス パート2', 'Gunsmith - Part 2', 't-mech', null, 7, ['q-gunsmith1'], [obj('o10', 'buildWeapon', 'AKS-74Uを改造する')], { kappa: true }),
  task('q-friend', '西からの友人 パート1', 'Friend from the West - Part 1', 't-skier', 'm-customs', 9, [], [
    obj('o11', 'giveItem', 'BEARのドッグタグを7個渡す', { items: [{ id: 'i-dogtag' }], count: 7, foundInRaid: true }),
  ], { faction: 'USEC' }),
  task('q-tarkov', '必需品', 'Supply plans', 't-skier', 'm-inter', 12, ['q-friend'], [
    obj('o12', 'giveItem', 'グラフィックカードを1個渡す', { items: [{ id: 'i-gpu' }], count: 1, foundInRaid: false }),
  ], { ll: 2 }),
  task('q-tushonka', '食料の確保', 'Acquaintance', 't-jaeger', 'm-woods', 8, ['q-intro'], [
    obj('o13', 'giveItem', 'ビーフシチュー缶を3個渡す', { items: [{ id: 'i-tushonka' }], count: 3, foundInRaid: true }),
  ], { kappa: true }),
  task('q-collector', 'コレクター', 'Collector', 't-fence', null, 30, ['q-pharma'], [
    obj('o14', 'giveItem', 'LEDXを渡す', { items: [{ id: 'i-ledx' }], count: 1, foundInRaid: true }),
  ], { kappa: true }),
]
const lvl = (level, items, stationReqs = [], traderReqs = [], desc = '') => ({
  level, constructionTime: 3600, description: desc,
  itemRequirements: items.map(([id, count, fir]) => ({ item: { id }, count, attributes: fir ? [{ type: 'foundInRaid', name: 'found_in_raid', value: 'true' }] : [] })),
  stationLevelRequirements: stationReqs.map(([id, l]) => ({ station: { id }, level: l })),
  traderRequirements: traderReqs.map(([id, v]) => ({ trader: { id }, requirementType: 'level', compareMethod: '>=', value: v })),
  skillRequirements: [],
})
const stations = [
  { id: 's-gen', name: '発電機', en: 'Generator', normalizedName: 'generator', levels: [
    lvl(1, [['i-roubles', 100000], ['i-wire', 2]]),
    lvl(2, [['i-hose', 2], ['i-gas', 1]], [['s-vents', 1]]),
    lvl(3, [['i-gpu', 1], ['i-wire', 5]], [['s-work', 2]], [['t-mech', 3]]),
  ] },
  { id: 's-vents', name: '換気口', en: 'Vents', normalizedName: 'vents', levels: [
    lvl(1, [['i-roubles', 25000], ['i-screw', 2]]),
    lvl(2, [['i-hose', 1], ['i-bolts', 2]], [['s-gen', 1]]),
  ] },
  { id: 's-work', name: '作業台', en: 'Workbench', normalizedName: 'workbench', levels: [
    lvl(1, [['i-bolts', 3], ['i-screw', 2]], [['s-gen', 1]]),
    lvl(2, [['i-bolts', 5], ['i-wire', 3]], [['s-work', 1]], [['t-mech', 2]]),
  ] },
  { id: 's-med', name: '医療ステーション', en: 'Medstation', normalizedName: 'medstation', levels: [
    lvl(1, [['i-salewa', 1], ['i-gas', 1]], []),
    lvl(2, [['i-ledx', 1], ['i-salewa', 2]], [['s-gen', 2]], [['t-thera', 2]]),
  ] },
  { id: 's-stash', name: 'スタッシュ', en: 'Stash', normalizedName: 'stash', levels: [
    lvl(1, []), lvl(2, [['i-roubles', 2500000]], [], [['t-ragman', 2]]),
  ] },
  { id: 's-lav', name: 'トイレ', en: 'Lavatory', normalizedName: 'lavatory', levels: [
    lvl(1, [['i-toilet', 1], ['i-matches', 2]]),
  ] },
]

function ja() {
  return {
    traders: traders.map(({ en, ...t }) => t),
    maps: maps.map(({ en, ...m }) => m),
    tasks: tasks.map(({ en, ...t }) => t),
    hideoutStations: stations.map(({ en, ...s }) => s),
    items: items.map(({ en, enShort, ...i }) => i),
  }
}
function en() {
  return {
    traders: traders.map((t) => ({ id: t.id, name: t.en })),
    maps: maps.map((m) => ({ id: m.id, name: m.en })),
    tasks: tasks.map((t) => ({ id: t.id, name: t.en })),
    hideoutStations: stations.map((s) => ({ id: s.id, name: s.en })),
    items: items.map((i) => ({ id: i.id, name: i.en, shortName: i.enShort })),
  }
}
export function mockResponse(lang) {
  return { data: lang === 'en' ? en() : ja() }
}
