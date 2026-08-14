// ═════════════════════════════════════════════════════════════════════════════
// featuredActressScoring.ts — VERITYオススメ女優「代表作品の自動解決」と「表示順スコア」（Phase B）
// ═════════════════════════════════════════════════════════════════════════════
// 掲載対象そのもの（FEATURED_ACTRESSES）は編集部が手動管理する固定リストであり、
// このモジュールが自動で追加・削除することは無い。ここで自動化しているのは
// 「掲載対象内の各女優について、DBから条件を満たす最新の代表作品を選ぶこと」と
// 「掲載対象内での表示順（スコア）を決めること」の2点だけ。
//
// 代表作品は必ず単体作品（metadata.actress配列の出演者数=1・そのidが対象女優）のみを
// 採用する。単体条件を緩めて共演作を代表作品にすることはしない（編集ルール）。
// 単体候補が見つからない場合は LEGACY_FALLBACK_CIDS（Phase B移行時点で編集部が使っていた
// 代表CIDのスナップショット）へフォールバックする。これは「毎回DBから取得」の原則には
// 反するが、あくまで異常系（単体候補が0件）専用の最終防波堤であり、通常運用では参照されない。
//
// articles取得は articles_metadata_actress_gin_idx（gin, jsonb_path_ops）を使った
// containment検索（`.filter('metadata->actress', 'cs', ...)`、SameActressWorks.tsx と
// 同じ方式）を35名分ORで束ねた単一クエリで行う。対象35名に無関係な記事は最初から
// 結果セットに含まれないため、articles全体が増えてもクエリ規模は35名の出演作数に
// 比例するだけで、日付ウィンドウや固定行数の当てずっぽうに依存しない。
//
// unstable_cache は cookie に依存する createClient('@/lib/supabase/server') を内部で
// 使えないため、fastestReleases.ts と同じ「匿名キー・cookie非依存のstatelessクライアント」
// パターンを踏襲する。
// ═════════════════════════════════════════════════════════════════════════════
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { FEATURED_ACTRESSES } from './featuredCids'
import { SATSUKI_NAO_META } from './satsukiNao'
import type { Article } from './types'

export type ScoreBreakdown = {
  latest:    number
  weekly:    number
  rising:    number
  spotlight: number
  newcomer:  number
  favorite:  number
}

export type FeaturedActressCard = {
  actressId:  number   // DMM actress numeric id（FEATURED_ACTRESSES の要素）
  externalId: string   // 'dmm-actress-<id>'
  name:       string
  article:    Article  // 自動解決された代表作品（必ず単体作品。異常系のみlegacy CID）
  score:      number
  breakdown:  ScoreBreakdown
}

// ── stateless client（fastestReleases.ts と同じ理由: unstable_cache 内で cookie は使えない）──
let _client: SupabaseClient | null = null
function getStatelessClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  _client = createSupabaseClient(url, key, { auth: { persistSession: false } })
  return _client
}

const ARTICLE_SELECT =
  'id,external_id,title,slug,source,category,tags,summary,image_url,published_at,fetched_at,metadata,is_active'

// Spotlight対象の女優external_id集合。SpotlightMeta型は女優特集と非女優特集(ジャンル特集)
// を区別しないため、現状唯一の女優ベースSpotlightであるsatsuki-naoのみを直接参照する。
// 今後2つ目の女優Spotlightが増える場合はここへ追記が必要（DDL/型変更は今回不要）。
const SPOTLIGHT_ACTRESS_EXTERNAL_IDS = new Set<string>([SATSUKI_NAO_META.actressExternalId])

// Phase B移行時点（2026-08時点で編集部が実際に使っていた）の代表CIDスナップショット。
// 単体候補が0件の異常系でのみ参照する最終フォールバック。希望みう(1113771)は移行前に
// 代表CIDが存在しないため未収録＝Tier1が0件なら単純にカード省略となる。
const LEGACY_FALLBACK_CIDS: Record<number, string> = {
  1084346: 'snos00357', 1072127: 'mida00798', 1060677: 'mida00766', 1109954: 'snos00270',
  1111496: 'ipzz00899', 1099472: 'snos00334', 1104815: 'ipzz00958', 1087624: 'ipzz00891',
  1111140: 'snos00290', 1105407: 'snos00311', 1089946: 'cjod00527', 1077423: '1fns00237',
  1104926: 'royd00325', 1084111: 'snos00302', 1103456: 'ipzz00920', 1084796: 'dsod00041',
  1106862: 'mida00765', 1100581: 'jur00792',  1092091: 'snos00309', 1044864: 'snos00371',
  1093791: 'snos00065', 1112139: 'ipzz00919', 1104816: 'ipzz00901', 1084214: 'ipzz00890',
  1107481: 'mida00764', 1106133: 'mida00724', 1102740: 'mida00759', 1075010: 'cjod00529',
  1111316: 'mida00778', 1112913: 'mida00716', 1112549: 'snos00409', 1111835: 'snos00317',
  1099846: 'snos00340', 1086581: 'snos00360',
}

function isExcludedTitle(title: string): boolean {
  return /BEST|ベスト|総集編|コンプリート|COMPLETE/i.test(title)
}

function isNonDvdVideoa(metadata: Record<string, unknown> | null): boolean {
  if (!metadata) return false
  if (metadata.floor !== 'videoa') return false
  const url = metadata.url
  if (typeof url === 'string' && url.includes('/mono/dvd/')) return false
  return true
}

function isSingleWorkFor(metadata: Record<string, unknown> | null, actressId: number): boolean {
  const list = metadata?.actress
  if (!Array.isArray(list) || list.length !== 1) return false
  const a = list[0] as { id?: number } | undefined
  return a?.id === actressId
}

// ── A. 代表作品スコア（未来日=予約作品と公開済みを明示的に分岐。Math.absは使わない） ──
function latestWorkScore(publishedAt: string | null): number {
  if (!publishedAt) return 0
  const now = Date.now()
  const pub = new Date(publishedAt).getTime()

  if (pub >= now) {
    // 予約作品（未来日）: 公開が近いほど高評価
    const daysUntil = (pub - now) / 86_400_000
    if (daysUntil <= 7)  return 100
    if (daysUntil <= 14) return 90
    if (daysUntil <= 30) return 75
    return 50
  }
  // 公開済み: 公開からの経過が短いほど高評価
  const daysAgo = (now - pub) / 86_400_000
  if (daysAgo <= 7)  return 100
  if (daysAgo <= 14) return 80
  if (daysAgo <= 30) return 60
  if (daysAgo <= 60) return 30
  return 0
}

// ── B. VERITY週間ランキング（weekly_rankings ranking_type='actress'） ───────────
function weeklyRankScore(rank: number | undefined): number {
  if (!rank) return 0
  if (rank === 1) return 60
  if (rank <= 3) return 45
  if (rank <= 10) return 30
  if (rank <= 20) return 15
  return 0
}

// ── C. 急上昇ランキング（weekly_rankings ranking_type='rising'。同一週間スナップショットの
//      5カテゴリの1つで、週間ランキングメール等でも「急上昇ランキング」と表記される値と同一） ──
function risingRankScore(rank: number | undefined): number {
  if (!rank) return 0
  if (rank <= 3) return 40
  if (rank <= 10) return 25
  if (rank <= 20) return 15
  return 0
}

// ── F. favorite登録数（少数ユーザーの操作で極端に動かないよう上限あり） ───────────
const FAVORITE_POINT_PER = 3
const FAVORITE_CAP = 30
function favoriteScore(count: number): number {
  return Math.min(count * FAVORITE_POINT_PER, FAVORITE_CAP)
}

// ── articles_metadata_actress_gin_idx を使った containment 検索（SameActressWorks.tsx と
//    同じ `.filter(col, 'cs', json)` 方式）を35名分 OR で束ねた単一クエリ。
//    is_active=true・floor=videoa以外は絞らない（対象女優に無関係な記事はそもそも
//    OR条件に一致しないため、日付ウィンドウは不要）。1リクエスト最大1000行のPostgREST
//    既定を踏まえ、必要な場合のみページを追加取得する（無制限ループにはしない）。
async function fetchActressPool(
  supabase: SupabaseClient,
  targetIds: number[],
): Promise<Article[]> {
  const orClauses = targetIds
    .map(id => `metadata->actress.cs.${JSON.stringify([{ id }])}`)
    .join(',')

  const pages: Article[][] = []
  const PAGE_SIZE = 1000
  const MAX_PAGES = 5 // 安全弁。現状データ(約1100件)なら1〜2ページで完結する。
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data } = await supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('is_active', true)
      .eq('metadata->>floor', 'videoa')
      .or(orClauses)
      .order('published_at', { ascending: false })
      .range(from, to)

    const rows = (data ?? []) as Article[]
    pages.push(rows)
    if (rows.length < PAGE_SIZE) break // 取得しきった
  }
  return pages.flat()
}

async function resolveFeaturedActressCardsRaw(): Promise<FeaturedActressCard[]> {
  const supabase = getStatelessClient()
  const targetIds = [...FEATURED_ACTRESSES] as number[]
  const targetIdSet = new Set<number>(targetIds)
  const externalIds = targetIds.map(id => `dmm-actress-${id}`)

  // ── クエリ1: actresses（id/uuid・external_id・name） ─────────────────────────
  const { data: actressRows } = await supabase
    .from('actresses')
    .select('id, external_id, name')
    .in('external_id', externalIds)

  const infoByExternalId = new Map<string, { uuid: string; name: string }>()
  for (const r of (actressRows ?? []) as { id: string; external_id: string; name: string }[]) {
    infoByExternalId.set(r.external_id, { uuid: r.id, name: r.name })
  }

  // ── クエリ2: 対象35名の出演作のみ（GIN index containment検索） ─────────────────
  const poolArticles = await fetchActressPool(supabase, targetIds)
  const articleByExternalId = new Map<string, Article>(poolArticles.map(a => [a.external_id, a]))

  const candidatesByActress = new Map<number, Article[]>()
  for (const art of poolArticles) {
    const meta = art.metadata as Record<string, unknown> | null
    const list = meta?.actress
    if (!Array.isArray(list)) continue
    for (const a of list as Array<{ id?: number }>) {
      if (typeof a?.id !== 'number' || !targetIdSet.has(a.id)) continue
      const bucket = candidatesByActress.get(a.id) ?? []
      bucket.push(art)
      candidatesByActress.set(a.id, bucket)
    }
  }

  // ── クエリ3a/3b: 最新公開週の週間ランキング（actress/rising/newcomerのみ使用） ───
  const nowIso = new Date().toISOString()
  const { data: latestWeek } = await supabase
    .from('weekly_rankings')
    .select('week_key')
    .lte('published_at', nowIso)
    .order('week_key', { ascending: false })
    .limit(1)
    .maybeSingle()

  const weeklyRankByExtId = new Map<string, number>()
  const risingRankByExtId = new Map<string, number>()
  const newcomerExtIds = new Set<string>()

  if (latestWeek?.week_key) {
    const { data: weeklyRows } = await supabase
      .from('weekly_rankings')
      .select('ranking_type, rank, entity_id')
      .eq('week_key', latestWeek.week_key as string)
      .in('ranking_type', ['actress', 'rising', 'newcomer'])

    for (const r of (weeklyRows ?? []) as { ranking_type: string; rank: number; entity_id: string }[]) {
      if (r.ranking_type === 'actress') weeklyRankByExtId.set(r.entity_id, r.rank)
      if (r.ranking_type === 'rising') risingRankByExtId.set(r.entity_id, r.rank)
      if (r.ranking_type === 'newcomer') newcomerExtIds.add(r.entity_id)
    }
  }

  // ── クエリ4: favorite_actresses（対象35名分のみ、user_idごとの個別クエリはしない） ──
  const targetUuids = [...infoByExternalId.values()].map(v => v.uuid)
  const favoriteCountByUuid = new Map<string, number>()
  if (targetUuids.length > 0) {
    const { data: favRows } = await supabase
      .from('favorite_actresses')
      .select('actress_id')
      .in('actress_id', targetUuids)
    for (const r of (favRows ?? []) as { actress_id: string }[]) {
      favoriteCountByUuid.set(r.actress_id, (favoriteCountByUuid.get(r.actress_id) ?? 0) + 1)
    }
  }

  // ── 代表作品の解決（単体作品のみ。緩和なし。異常系のみlegacy CIDへfallback） ─────
  const cards: FeaturedActressCard[] = []
  for (const actressId of targetIds) {
    const extId = `dmm-actress-${actressId}`
    const info = infoByExternalId.get(extId)
    const candidates = candidatesByActress.get(actressId) ?? [] // published_at desc（クエリ順を維持）

    // 唯一の採用条件: 単体（出演1名＝対象ID）・videoa・非DVD・BEST等除外。緩和は行わない。
    let chosen = candidates.find(a =>
      isNonDvdVideoa(a.metadata as Record<string, unknown> | null) &&
      isSingleWorkFor(a.metadata as Record<string, unknown> | null, actressId) &&
      !isExcludedTitle(a.title),
    )

    // 異常系フォールバック: 単体候補が1件も無い場合のみ、移行時点の代表CIDスナップショットを使う。
    if (!chosen) {
      const legacyCid = LEGACY_FALLBACK_CIDS[actressId]
      if (legacyCid) chosen = articleByExternalId.get(legacyCid)
    }

    if (!chosen || !info) continue // 単体候補もlegacy CIDも無い場合のみ、この回はカードを省略

    const rank = weeklyRankByExtId.get(extId)
    const risingRank = risingRankByExtId.get(extId)
    const isNewcomer = newcomerExtIds.has(extId)
    const isSpotlight = SPOTLIGHT_ACTRESS_EXTERNAL_IDS.has(extId)
    const favCount = favoriteCountByUuid.get(info.uuid) ?? 0

    const breakdown: ScoreBreakdown = {
      latest:    latestWorkScore(chosen.published_at),
      weekly:    weeklyRankScore(rank),
      rising:    risingRankScore(risingRank),
      spotlight: isSpotlight ? 30 : 0,
      newcomer:  isNewcomer ? 20 : 0,
      favorite:  favoriteScore(favCount),
    }
    const score = breakdown.latest + breakdown.weekly + breakdown.rising +
      breakdown.spotlight + breakdown.newcomer + breakdown.favorite

    cards.push({ actressId, externalId: extId, name: info.name, article: chosen, score, breakdown })
  }

  // ── 表示順ソート（同点タイブレーク: 代表作published_at DESC → 週間順位 → 定義順） ──
  const definitionOrder = new Map(targetIds.map((id, i) => [id, i]))
  cards.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aPub = a.article.published_at ? new Date(a.article.published_at).getTime() : 0
    const bPub = b.article.published_at ? new Date(b.article.published_at).getTime() : 0
    if (bPub !== aPub) return bPub - aPub
    const aRank = weeklyRankByExtId.get(a.externalId) ?? 9999
    const bRank = weeklyRankByExtId.get(b.externalId) ?? 9999
    if (aRank !== bRank) return aRank - bRank
    return (definitionOrder.get(a.actressId) ?? 0) - (definitionOrder.get(b.actressId) ?? 0)
  })

  return cards
}

// 5分キャッシュ（全ユーザー共通の非個人化データ。fastestReleases.ts と同じ revalidate値）。
export const getFeaturedActressCards = unstable_cache(
  resolveFeaturedActressCardsRaw,
  ['featured-actress-cards-v2'],
  { revalidate: 300 },
)
