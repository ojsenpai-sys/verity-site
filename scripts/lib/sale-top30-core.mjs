// scripts/lib/sale-top30-core.mjs — VERITY SALE TOP30 の純粋ロジック（副作用なし・I/Oなし）。
// sync-sale-top30.mjs 本体と scripts/__tests__/sale-top30.test.mjs の両方から import される。
// ネットワーク/DB呼び出しを一切含まないため node:test で決定論的にテストできる。

// ── active campaign 判定 ─────────────────────────────────────────────────────
// DMM ItemList の campaign配列要素 { date_begin, date_end, title } (JST, "YYYY-MM-DD HH:mm:ss")
// を受け取り、date_begin <= now < date_end を満たすかを判定する。
export function isActiveCampaignAt(campaign, now) {
  const b = new Date(campaign.date_begin.replace(' ', 'T') + '+09:00')
  const e = new Date(campaign.date_end.replace(' ', 'T') + '+09:00')
  return b <= now && now < e
}

export function filterActiveCampaigns(campaigns, now) {
  return (campaigns || []).filter((c) => isActiveCampaignAt(c, now))
}

// ── dedupe ────────────────────────────────────────────────────────────────────
export function dedupeByCid(items, cidKey = 'content_id') {
  const seen = new Map()
  for (const it of items) if (!seen.has(it[cidKey])) seen.set(it[cidKey], it)
  return [...seen.values()]
}

// ── 正規化 ────────────────────────────────────────────────────────────────────
export function minmax(arr) {
  if (arr.length === 0) return []
  const max = Math.max(...arr)
  const min = Math.min(...arr)
  return arr.map((v) => (max === min ? 0 : (v - min) / (max - min)))
}

export function log1pMinmax(arr) {
  return minmax(arr.map((v) => Math.log1p(Math.max(0, v))))
}

// 新作度: 経過日数の固定減衰カーブ（プール相対のmin-maxにしない）。
// 理由: 極端に新しい1件が min-max のレンジを独占して他が全て0付近に潰れるのを避けるため、
// pool非依存の固定halfLifeで 0..1 に写像する。呼び出し側で weight(<=10点分)を掛けて使う。
export function freshnessScore(ageDays, halfLifeDays = 180) {
  if (ageDays == null || !Number.isFinite(ageDays)) return 0
  return Math.max(0, Math.min(1, 1 - ageDays / halfLifeDays))
}

// ── VERITY SALE SCORE v1 ────────────────────────────────────────────────────
// v1 で加点に使うのは videoView / fanzaClick / discount / freshness / actress の5指標のみ。
// favorite / weeklyWork は Phase B実測でカバレッジがほぼ0のため v1 では重み0固定。
// コードとしては削除せず weight:0 で残し、v2 で再導入しやすい構造にする。
export const SALE_SCORE_V1_WEIGHTS = Object.freeze({
  videoView: 35,
  fanzaClick: 30,
  discount: 20,
  freshness: 10,
  actress: 5,
  favorite: 0,   // reserved for v2 — Phase B実測: favorite_articles 全体2件のみ
  weeklyWork: 0, // reserved for v2 — Phase B実測: weekly_rankings work一致 0/181件
})

/**
 * features: [{ cid, videoView30d, fanzaClick30d, discountPct, ageDays, actressScoreRaw, favoriteCount, weeklyWorkScoreRaw, ... }]
 * weights:  SALE_SCORE_V1_WEIGHTS 相当（合計が100でなくても内部で正規化する）
 * 戻り値: 各featureに `.score` (0..100スケール) を付与した配列（元の並び順を保持、ソートはしない）
 */
export function computeSaleScoreV1(features, weights = SALE_SCORE_V1_WEIGHTS) {
  const n = features.length
  if (n === 0) return []

  const vv = log1pMinmax(features.map((f) => f.videoView30d || 0))
  const fc = log1pMinmax(features.map((f) => f.fanzaClick30d || 0))
  const disc = minmax(features.map((f) => f.discountPct || 0))
  const fresh = features.map((f) => freshnessScore(f.ageDays))
  const actressRaw = features.map((f) => f.actressScoreRaw || 0)
  const actress = minmax(actressRaw)
  const favorite = minmax(features.map((f) => f.favoriteCount || 0))
  const weeklyWork = minmax(features.map((f) => f.weeklyWorkScoreRaw || 0))

  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  const w = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / wSum]))

  return features.map((f, i) => {
    const total =
      w.videoView * vv[i] +
      w.fanzaClick * fc[i] +
      w.discount * disc[i] +
      w.freshness * fresh[i] +
      w.actress * actress[i] +
      w.favorite * favorite[i] +
      w.weeklyWork * weeklyWork[i]
    return { ...f, score: Math.round(total * 10000) / 100 } // 0..100 scale, 2 decimals
  })
}

// ── diversity制御 ────────────────────────────────────────────────────────────
/**
 * score降順で並んだ候補から、同一女優 maxPerActress件・同一メーカー maxPerMaker件までを
 * 上限としてtargetCount件を選ぶ。上限超過候補はskipし次点を繰り上げる。
 * 候補が尽きてtargetCountに届かない場合は shortfall:true を返す（呼び出し側でapply拒否する）。
 * ties: 同スコアは discountPct 降順 → cid 昇順で決定論的にソートしてから選択する。
 */
export function selectDiversifiedTop30(scoredFeatures, opts = {}) {
  const { maxPerActress = 2, maxPerMaker = 4, targetCount = 30 } = opts
  const sorted = [...scoredFeatures].sort(
    (a, b) => b.score - a.score || (b.discountPct || 0) - (a.discountPct || 0) || a.cid.localeCompare(b.cid),
  )
  const actressCount = new Map()
  const makerCount = new Map()
  const selected = []
  let skippedCount = 0
  const skipReasons = []

  for (const f of sorted) {
    if (selected.length >= targetCount) break
    const actresses = f.actresses && f.actresses.length ? f.actresses : [null]
    const maker = f.maker ?? null

    const actressBlocked = actresses.some((a) => a != null && (actressCount.get(a) || 0) >= maxPerActress)
    const makerBlocked = maker != null && (makerCount.get(maker) || 0) >= maxPerMaker

    if (actressBlocked || makerBlocked) {
      skippedCount++
      skipReasons.push({ cid: f.cid, reason: actressBlocked ? 'actress_cap' : 'maker_cap' })
      continue
    }

    selected.push(f)
    for (const a of actresses) if (a != null) actressCount.set(a, (actressCount.get(a) || 0) + 1)
    if (maker != null) makerCount.set(maker, (makerCount.get(maker) || 0) + 1)
  }

  return {
    selected,
    skippedCount,
    skipReasons,
    shortfall: selected.length < targetCount,
    maxSameActress: Math.max(0, ...actressCount.values()),
    maxSameMaker: Math.max(0, ...makerCount.values()),
  }
}

// ── snapshot行の検証（RPC側のfail-closedチェックをクライアント側でも先取り検証） ─
export function validateSnapshotRows(rows, expectedCount = 30) {
  const errors = []
  if (!Array.isArray(rows) || rows.length !== expectedCount) {
    errors.push(`expected exactly ${expectedCount} rows, got ${Array.isArray(rows) ? rows.length : typeof rows}`)
    return { valid: false, errors }
  }
  const ranks = rows.map((r) => r.rank)
  const uniqueRanks = new Set(ranks)
  if (uniqueRanks.size !== rows.length) errors.push('duplicate rank detected')
  if (Math.min(...ranks) !== 1 || Math.max(...ranks) !== expectedCount) errors.push(`rank range must be 1..${expectedCount}`)

  const cids = rows.map((r) => r.external_id)
  const uniqueCids = new Set(cids)
  if (uniqueCids.size !== rows.length) errors.push('duplicate external_id detected')

  for (const r of rows) {
    if (r.external_id == null || r.external_id === '') errors.push(`row rank=${r.rank}: missing external_id`)
    if (r.score == null || Number.isNaN(r.score)) errors.push(`row rank=${r.rank}: score is null/NaN`)
  }
  return { valid: errors.length === 0, errors }
}

// ── snapshot diff ────────────────────────────────────────────────────────────
export function diffSnapshots(currentRows, nextRows) {
  const currentCids = new Set((currentRows || []).map((r) => r.external_id))
  const nextCids = new Set(nextRows.map((r) => r.external_id))
  const added = nextRows.filter((r) => !currentCids.has(r.external_id)).map((r) => r.external_id)
  const removed = (currentRows || []).filter((r) => !nextCids.has(r.external_id)).map((r) => r.external_id)

  const currentRankByCid = new Map((currentRows || []).map((r) => [r.external_id, r.rank]))
  const rankChanged = nextRows
    .filter((r) => currentRankByCid.has(r.external_id) && currentRankByCid.get(r.external_id) !== r.rank)
    .map((r) => ({ cid: r.external_id, from: currentRankByCid.get(r.external_id), to: r.rank }))

  const isEmpty = added.length === 0 && removed.length === 0 && rankChanged.length === 0
  return { added, removed, rankChanged, isEmpty }
}
