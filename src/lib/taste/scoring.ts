import type {
  AnsweredItem,
  ScoredActress,
  ScoredWork,
  TasteActressInfo,
  TasteAnswer,
  TasteCandidate,
  TasteSummaryLine,
  TasteWeights,
} from './types'

// recommendation.ts を分離すると tsc(moduleResolution: bundler) と node --test の
// 拡張子要件が両立できない（同一ファイル内の相対value importが両者で異なる書式を要求する）ため、
// スコアリングと推薦ランキングは1ファイルに統合している。

// GenreProfilingModal.tsx / genre-scores/route.ts と同趣旨のノイズタグ除外。
// 女優傾向スコアではなく作品フォーマット/画質等のタグを誤ってジャンル一致に
// カウントしないための小さな固定リスト（Taste モジュール内で完結させ、他機能には触れない）。
const NOISE_TAGS = new Set([
  'サンプル動画', 'Blu-ray（ブルーレイ）', 'ハイビジョン', '4K',
  '4時間以上作品', '特典付き・セット商品', 'イメージビデオ',
])
function isNoisyTag(t: string): boolean {
  return NOISE_TAGS.has(t) || t.includes('VR') || /^\d/.test(t) || t.includes('年代') || t.includes('DOD')
}

export const ANSWER_POINTS: Record<TasteAnswer, number> = {
  like: 2,
  neutral: 0,
  dislike: -1,
}

/** tags の中から「女優名タグ」を除外した、純粋なジャンル/属性タグの集合を作る。 */
function buildActressNameSet(pool: readonly TasteCandidate[]): Set<string> {
  const names = new Set<string>()
  for (const c of pool) {
    for (const a of c.actress) names.add(a.name)
  }
  return names
}

/**
 * LIKE/NEUTRAL/DISLIKE の回答から actress/series/maker/tag の重みを集計する。
 * DISLIKE は soft penalty（-1）であり、単独で永久除外はしない。
 * pure function。
 */
export function computeWeights(
  answers: readonly AnsweredItem[],
  fullPool: readonly TasteCandidate[],
): TasteWeights {
  const actressNameSet = buildActressNameSet(fullPool)
  const weights: TasteWeights = {
    actress: new Map(),
    series: new Map(),
    maker: new Map(),
    tag: new Map(),
  }

  for (const { candidate, answer } of answers) {
    const points = ANSWER_POINTS[answer]
    if (points === 0) continue

    for (const a of candidate.actress) {
      weights.actress.set(a.id, (weights.actress.get(a.id) ?? 0) + points)
    }
    for (const s of candidate.series) {
      if (s.id <= 0) continue
      weights.series.set(s.id, (weights.series.get(s.id) ?? 0) + points)
    }
    for (const m of candidate.maker) {
      if (m.id <= 0) continue
      weights.maker.set(m.id, (weights.maker.get(m.id) ?? 0) + points)
    }
    for (const tag of candidate.tags) {
      if (isNoisyTag(tag) || actressNameSet.has(tag)) continue
      weights.tag.set(tag, (weights.tag.get(tag) ?? 0) + points)
    }
  }

  return weights
}

const ACTRESS_MULTIPLIER = 3
const SERIES_MULTIPLIER = 2
const MAKER_MULTIPLIER = 1.5
const TAG_MULTIPLIER = 1
const TAG_CONTRIBUTION_CAP = 18 // RelatedWorksScored.tsx のタグ上限(9)相当をweighted版に合わせて拡張

/**
 * 1候補作品の生スコアを重みから算出する。0-100正規化は呼び出し側（rankCandidates系）で行う。
 * pure function。metadata欠損（actress/series/maker/tags空）でも例外を投げず0を返す。
 */
export function scoreCandidateRaw(candidate: TasteCandidate, weights: TasteWeights): number {
  let score = 0

  for (const a of candidate.actress) {
    score += ACTRESS_MULTIPLIER * (weights.actress.get(a.id) ?? 0)
  }
  for (const s of candidate.series) {
    score += SERIES_MULTIPLIER * (weights.series.get(s.id) ?? 0)
  }
  for (const m of candidate.maker) {
    score += MAKER_MULTIPLIER * (weights.maker.get(m.id) ?? 0)
  }

  let tagScore = 0
  for (const tag of candidate.tags) {
    tagScore += weights.tag.get(tag) ?? 0
  }
  tagScore = Math.max(-TAG_CONTRIBUTION_CAP, Math.min(TAG_CONTRIBUTION_CAP, tagScore))
  score += TAG_MULTIPLIER * tagScore

  return score
}

/**
 * 生スコアの配列から最大値を基準に0-100へ正規化する（VERITY独自スコア。統計的精度を主張しない）。
 * 最大値が0以下（好みシグナルが無い/全てneutral・dislike）の場合は全件0を返す
 * — 呼び出し側はこれを「フォールバック推薦に切り替える」トリガーとして扱う。
 */
export function normalizeScores(rawScores: readonly number[]): number[] {
  const max = Math.max(0, ...rawScores)
  if (max <= 0) return rawScores.map(() => 0)
  return rawScores.map(r => Math.round((Math.max(0, r) / max) * 100))
}

export function matchLabel(score: number): string {
  if (score >= 75) return 'かなり近い'
  if (score >= 45) return '好みに合いそう'
  return '新しい発見'
}

// ── 推薦ランキング（作品/女優）/ 要約テンプレート ──────────────────────────────

// src/lib/actressUrl.ts の externalId 生成規約（`dmm-actress-<numericId>`）と揃える。
function actressExternalIdFromNumericId(id: number): string {
  return `dmm-actress-${id}`
}

function buildReasons(candidate: TasteCandidate, weights: TasteWeights): string[] {
  const reasons: string[] = []

  const likedActress = candidate.actress.find(a => (weights.actress.get(a.id) ?? 0) > 0)
  if (likedActress) reasons.push(`${likedActress.name}さんの作品`)

  const likedSeries = candidate.series.find(s => s.id > 0 && (weights.series.get(s.id) ?? 0) > 0)
  if (likedSeries) reasons.push('好みのシリーズ')

  const likedMaker = candidate.maker.find(m => m.id > 0 && (weights.maker.get(m.id) ?? 0) > 0)
  if (likedMaker) reasons.push(`${likedMaker.name}の作品`)

  const likedTags = candidate.tags
    .map(t => ({ t, w: weights.tag.get(t) ?? 0 }))
    .filter(x => x.w > 0)
    .sort((a, b) => b.w - a.w)
  if (likedTags.length > 0 && reasons.length < 2) reasons.push(`「${likedTags[0].t}」系`)

  if (reasons.length === 0) reasons.push('新しい発見かもしれません')
  return reasons.slice(0, 2)
}

export type RankWorksOptions = {
  /** 診断で既に出題済みの作品（回答内容に関わらず）は推薦対象から除外する。 */
  excludeExternalIds?: ReadonlySet<string>
  limit?: number
}

/**
 * LIKE集計済みweightsから作品候補プールをスコアリングし上位を返す。
 * 好みシグナルが無い（全candidate rawScore<=0）場合は、人気(isPopular)寄りの
 * フォールバック順（=好みが分からない状態で0件表示を避けるための安全策）にする。
 * pure function。
 */
export function rankWorks(
  pool: readonly TasteCandidate[],
  weights: TasteWeights,
  options: RankWorksOptions = {},
): ScoredWork[] {
  const excludeIds = options.excludeExternalIds ?? new Set<string>()
  const limit = options.limit ?? 10

  const eligible = pool.filter(c => c.imageUrl && !excludeIds.has(c.externalId))
  if (eligible.length === 0) return []

  const raw = eligible.map(c => scoreCandidateRaw(c, weights))
  const hasSignal = raw.some(r => r > 0)

  if (!hasSignal) {
    // フォールバック: 人気シグナルがある候補を優先し、無ければ元の順序のまま先頭からlimit件。
    const popularFirst = [...eligible].sort((a, b) => Number(b.isPopular ?? false) - Number(a.isPopular ?? false))
    return popularFirst.slice(0, limit).map(candidate => ({
      candidate,
      score: 0,
      matchLabel: matchLabel(0),
      reasons: ['話題の作品'],
    }))
  }

  const normalized = normalizeScores(raw)
  const scored = eligible.map((candidate, i) => ({ candidate, raw: raw[i], score: normalized[i] }))
  scored.sort((a, b) => {
    if (b.raw !== a.raw) return b.raw - a.raw
    return (b.candidate.publishedAt ?? '').localeCompare(a.candidate.publishedAt ?? '')
  })

  return scored.slice(0, limit).map(({ candidate, score }) => ({
    candidate,
    score,
    matchLabel: matchLabel(score),
    reasons: buildReasons(candidate, weights),
  }))
}

export type RankActressesOptions = {
  /** 診断中に出題済みの女優 id（未知の女優を混ぜるための判定に使う）。 */
  shownActressIds?: ReadonlySet<number>
  limit?: number
  /** 未出題女優を最低何名は含めるか。 */
  preferUnseenMin?: number
}

/**
 * actress weight から表示可能な女優（actressIndexにいる）だけを対象に推薦する。
 * 好みシグナルが無い場合は候補プール中の頻出女優（isPopular優先）にフォールバックする。
 * pure function。
 */
export function rankActresses(
  pool: readonly TasteCandidate[],
  actressIndex: Readonly<Record<string, TasteActressInfo>>,
  weights: TasteWeights,
  options: RankActressesOptions = {},
): ScoredActress[] {
  const limit = options.limit ?? 5
  const preferUnseenMin = options.preferUnseenMin ?? 2
  const shownIds = options.shownActressIds ?? new Set<number>()

  // pool中に登場する女優のうち、表示情報(actressIndex)があるものだけを候補にする
  const byId = new Map<number, { info: TasteActressInfo; frequency: number; popularHits: number }>()
  for (const c of pool) {
    for (const a of c.actress) {
      const info = actressIndex[actressExternalIdFromNumericId(a.id)]
      if (!info) continue
      const entry = byId.get(a.id) ?? { info, frequency: 0, popularHits: 0 }
      entry.frequency += 1
      if (c.isPopular) entry.popularHits += 1
      byId.set(a.id, entry)
    }
  }

  if (byId.size === 0) return []

  const rawEntries = [...byId.entries()].map(([id, v]) => ({
    id,
    info: v.info,
    raw: weights.actress.get(id) ?? 0,
    popularHits: v.popularHits,
  }))
  const hasSignal = rawEntries.some(e => e.raw > 0)

  if (!hasSignal) {
    const fallback = [...rawEntries].sort((a, b) => b.popularHits - a.popularHits)
    return fallback.slice(0, limit).map(e => ({
      info: e.info,
      score: 0,
      reason: '人気の女優です',
    }))
  }

  const normalized = normalizeScores(rawEntries.map(e => e.raw))
  const scored = rawEntries
    .map((e, i) => ({ ...e, score: normalized[i] }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.raw - a.raw)

  const unseen = scored.filter(e => !shownIds.has(e.id))
  const seen = scored.filter(e => shownIds.has(e.id))

  const picked: typeof scored = []
  const pickedIds = new Set<number>()
  for (const e of unseen) {
    if (picked.length >= preferUnseenMin) break
    picked.push(e)
    pickedIds.add(e.id)
  }
  for (const e of [...unseen, ...seen]) {
    if (picked.length >= limit) break
    if (pickedIds.has(e.id)) continue
    picked.push(e)
    pickedIds.add(e.id)
  }

  return picked.slice(0, limit).map(e => ({
    info: e.info,
    score: e.score,
    reason: shownIds.has(e.id) ? 'あなたが「好み」に選んだ女優です' : '好みの傾向から見つかりました',
  }))
}

const SUMMARY_MIN_WEIGHT = 2

function topEntries<K>(map: ReadonlyMap<K, number>, n: number): Array<{ key: K; weight: number }> {
  return [...map.entries()]
    .filter(([, w]) => w >= SUMMARY_MIN_WEIGHT)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, weight]) => ({ key, weight }))
}

/**
 * 回答傾向のテンプレート要約を生成する。自然言語生成ではなく、
 * weights に裏付けられた項目のみを文面化する（存在しない傾向を書かない）。
 * pure function。
 */
export function buildTasteSummary(
  answers: readonly AnsweredItem[],
  weights: TasteWeights,
  fullPool: readonly TasteCandidate[],
): TasteSummaryLine[] {
  const likeCount = answers.filter(a => a.answer === 'like').length
  if (likeCount === 0) {
    return ['「好み」に選んだ作品がありませんでしたが、幅広い傾向を確認できました。']
  }

  const makerNameById = new Map<number, string>()
  for (const c of fullPool) {
    for (const m of c.maker) if (!makerNameById.has(m.id)) makerNameById.set(m.id, m.name)
  }

  const lines: TasteSummaryLine[] = []
  const topTags = topEntries(weights.tag, 2)
  const topMakers = topEntries(weights.maker, 1)

  if (topTags[0]) lines.push(`あなたは「${topTags[0].key}」系の作品を多く選びました。`)
  if (topTags[1]) lines.push(`特に「${topTags[1].key}」への反応も高めです。`)
  const makerName = topMakers[0] ? makerNameById.get(topMakers[0].key) : undefined
  if (makerName) lines.push(`メーカーでは「${makerName}」の作品を多く選択しています。`)

  if (lines.length === 0) {
    lines.push('好みの傾向がはっきり出るまでには、もう少しデータが必要そうです。')
  }
  return lines
}
