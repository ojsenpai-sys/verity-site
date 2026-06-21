import { createClient } from '@/lib/supabase/server'

/**
 * VERITY 作品スコアリング — user_events の実ユーザー行動から算出。
 *
 * 重み:
 *   fanza_click * 5  (購入意図)
 *   video_view  * 2  (視聴遷移)
 *   page_view   * 1  (作品ページ閲覧 — 計測導入後に有効化)
 *
 * 現状 analytics.ts は page_view を発火していないため、実質
 *   fanza_click * 5 + video_view * 2
 * の合算で動作する。page_view 計測が入れば自動で寄与する設計。
 *
 * 算出は in-memory 集計。母数が増えたら Phase 4-6 で materialized view へ移行する。
 */

export type ScorePeriod = '7d' | '30d' | '90d' | '180d' | '365d' | 'all'

export const PERIOD_HOURS: Record<ScorePeriod, number | null> = {
  '7d':    7   * 24,
  '30d':   30  * 24,
  '90d':   90  * 24,
  '180d':  180 * 24,
  '365d':  365 * 24,
  'all':   null,
}

export const EVENT_WEIGHT: Record<string, number> = {
  fanza_click: 5,
  video_view:  2,
  page_view:   1,
}

const SCORED_EVENTS = Object.keys(EVENT_WEIGHT) as Array<keyof typeof EVENT_WEIGHT>

type EventRow = {
  target_id:  string
  event_name: string
  created_at: string
}

// ── ローレベル: 期間内のイベントを取得 ──────────────────────────────────────

async function fetchEvents(args: {
  targetType:  'article' | 'actress'
  targetIds?:  string[]
  sinceHours?: number | null
  limit?:      number
}): Promise<EventRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('user_events')
    .select('target_id, event_name, created_at')
    .eq('target_type', args.targetType)
    .in('event_name', SCORED_EVENTS)
    .not('target_id', 'is', null)

  if (args.targetIds && args.targetIds.length > 0) {
    q = q.in('target_id', args.targetIds)
  }
  if (args.sinceHours != null) {
    q = q.gte('created_at', new Date(Date.now() - args.sinceHours * 3_600_000).toISOString())
  }

  const { data } = await q.limit(args.limit ?? 50_000)
  return ((data ?? []) as EventRow[]).filter(r => r.target_id && r.event_name)
}

// ── スコア集計ヘルパ ────────────────────────────────────────────────────────

export function scoreEvents(rows: EventRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const w = EVENT_WEIGHT[r.event_name] ?? 0
    if (!w) continue
    m.set(r.target_id, (m.get(r.target_id) ?? 0) + w)
  }
  return m
}

// ── 公開関数 ────────────────────────────────────────────────────────────────

/** 指定 CID 群のスコアを期間別に集計。 */
export async function getArticleScores(
  cids: string[],
  period: ScorePeriod = '30d',
): Promise<Map<string, number>> {
  if (cids.length === 0) return new Map()
  const rows = await fetchEvents({
    targetType: 'article',
    targetIds:  cids,
    sinceHours: PERIOD_HOURS[period],
  })
  return scoreEvents(rows)
}

/** 指定 actress external_id 群のスコアを期間別に集計。 */
export async function getActressScores(
  externalIds: string[],
  period: ScorePeriod = '30d',
): Promise<Map<string, number>> {
  if (externalIds.length === 0) return new Map()
  const rows = await fetchEvents({
    targetType: 'actress',
    targetIds:  externalIds,
    sinceHours: PERIOD_HOURS[period],
  })
  return scoreEvents(rows)
}

/** 全 article 期間スコア (母集団は最新 limit 件相当)。ランキング用。 */
export async function getAllArticleScores(
  period: ScorePeriod = '30d',
  limitEvents = 30_000,
): Promise<Map<string, number>> {
  const rows = await fetchEvents({
    targetType: 'article',
    sinceHours: PERIOD_HOURS[period],
    limit:      limitEvents,
  })
  return scoreEvents(rows)
}

/** 全 actress 期間スコア。 */
export async function getAllActressScores(
  period: ScorePeriod = '30d',
  limitEvents = 30_000,
): Promise<Map<string, number>> {
  const rows = await fetchEvents({
    targetType: 'actress',
    sinceHours: PERIOD_HOURS[period],
    limit:      limitEvents,
  })
  return scoreEvents(rows)
}

/**
 * 指定 cid 群に対する recent (直近 days) と prior (その前 days) のスコア比を返す。
 * 急上昇判定 / ロングヒット判定で使用。
 */
export async function getRecentVsPriorScores(
  cids: string[],
  days = 30,
): Promise<Map<string, { recent: number; prior: number }>> {
  if (cids.length === 0) return new Map()
  const supabase = await createClient()
  const now    = Date.now()
  const recent = new Date(now - days * 24 * 3_600_000).toISOString()
  const prior  = new Date(now - 2 * days * 24 * 3_600_000).toISOString()

  const { data } = await supabase
    .from('user_events')
    .select('target_id, event_name, created_at')
    .eq('target_type', 'article')
    .in('event_name', SCORED_EVENTS)
    .in('target_id', cids)
    .gte('created_at', prior)
    .limit(50_000)

  const result = new Map<string, { recent: number; prior: number }>()
  for (const r of ((data ?? []) as EventRow[])) {
    if (!cids.includes(r.target_id)) continue
    const w = EVENT_WEIGHT[r.event_name] ?? 0
    if (!w) continue
    const isRecent = r.created_at >= recent
    const cur = result.get(r.target_id) ?? { recent: 0, prior: 0 }
    if (isRecent) cur.recent += w
    else cur.prior  += w
    result.set(r.target_id, cur)
  }
  for (const cid of cids) {
    if (!result.has(cid)) result.set(cid, { recent: 0, prior: 0 })
  }
  return result
}

// ── 順位計算 ────────────────────────────────────────────────────────────────

/**
 * targetScore が scoresMap の値分布の中で何 percentile に位置するか (0〜100, 小さいほど上位)。
 * 例: rankPercentile(80, [100,80,60,40]) → 25 (上位 25%)
 * 0件のときは null。
 */
export function rankPercentile(
  targetScore: number,
  scoresMap: Map<string, number>,
): number | null {
  const values = [...scoresMap.values()]
  if (values.length === 0) return null
  // 上位率: targetScore より高いスコアの割合 (同点は上位扱い)
  const higher = values.filter(v => v > targetScore).length
  return Math.round((higher / values.length) * 100)
}

/** percentile を "TOP X%" 文字列に整形。10%刻みで丸める。 */
export function formatPercentile(pct: number | null): string | null {
  if (pct === null) return null
  if (pct < 1)  return 'TOP 1%'
  if (pct <= 5)  return 'TOP 5%'
  if (pct <= 10) return 'TOP 10%'
  if (pct <= 25) return 'TOP 25%'
  if (pct <= 50) return 'TOP 50%'
  return null
}
