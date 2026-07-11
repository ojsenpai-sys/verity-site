import { createClient } from '@/lib/supabase/server'

// 週間ランキング（041 weekly_rankings スナップショット）の読み取りヘルパー。
//
// weekly_rankings は anon SELECT 可（RLS: published_at<=now() の行のみ可視）。
// バッチが日曜23:30の published_at で確定・全置換するため、フロントは「最新の確定週」を
// そのまま読むだけでよい（毎回集計しない）。データ未確定時は null を返し、
// 呼び出し側でセクションごと非表示にグレースフル劣化させる。

export const WEEKLY_RANKING_TYPES = ['actress', 'work', 'maker', 'newcomer', 'rising'] as const
export type WeeklyRankingType = (typeof WEEKLY_RANKING_TYPES)[number]

export type WeeklyRankingRow = {
  ranking_type:            WeeklyRankingType
  rank:                    number
  entity_type:             string
  entity_id:               string
  entity_name:             string
  score:                   number
  unique_sessions:         number
  total_views:             number
  previous_rank:           number | null
  rank_change:             number | null
  is_new_entry:            boolean
  consecutive_weeks_rank1: number
  metadata:                Record<string, unknown>
}

export type WeeklyRankings = {
  weekKey:      string
  periodStart:  string
  periodEnd:    string
  publishedAt:  string
  rankings:     Record<WeeklyRankingType, WeeklyRankingRow[]>
}

const SELECT_COLS =
  'week_key, ranking_type, rank, entity_type, entity_id, entity_name, score, ' +
  'unique_sessions, total_views, previous_rank, rank_change, is_new_entry, ' +
  'consecutive_weeks_rank1, metadata, period_start, period_end, published_at'

function group(rows: (WeeklyRankingRow & { period_start?: string })[]): Record<WeeklyRankingType, WeeklyRankingRow[]> {
  const out = { actress: [], work: [], maker: [], newcomer: [], rising: [] } as Record<WeeklyRankingType, WeeklyRankingRow[]>
  for (const r of rows) if (out[r.ranking_type]) out[r.ranking_type].push(r)
  for (const k of WEEKLY_RANKING_TYPES) out[k].sort((a, b) => a.rank - b.rank)
  return out
}

async function fetchWeek(weekKey: string | null): Promise<WeeklyRankings | null> {
  const supabase = await createClient()
  let key = weekKey
  if (!key) {
    // RLS が未公開週を隠すため、可視な最新 week_key を取得
    const { data: latest } = await supabase
      .from('weekly_rankings')
      .select('week_key')
      .order('week_key', { ascending: false })
      .limit(1)
      .maybeSingle()
    key = (latest as { week_key?: string } | null)?.week_key ?? null
  }
  if (!key) return null

  const { data, error } = await supabase
    .from('weekly_rankings')
    .select(SELECT_COLS)
    .eq('week_key', key)
    .order('ranking_type', { ascending: true })
    .order('rank', { ascending: true })

  if (error) { console.error('[weekly-rankings]', error.message); return null }
  const rows = (data ?? []) as unknown as (WeeklyRankingRow & { period_start: string; period_end: string; published_at: string })[]
  if (rows.length === 0) return null

  return {
    weekKey:     key,
    periodStart: rows[0].period_start,
    periodEnd:   rows[0].period_end,
    publishedAt: rows[0].published_at,
    rankings:    group(rows),
  }
}

/** 最新の確定週（published_at<=now の最大 week_key）の5ランキングを取得。無ければ null。 */
export function getLatestWeeklyRankings(): Promise<WeeklyRankings | null> {
  return fetchWeek(null)
}

/** 指定週（week_key='YYYY-MM-DD'）の5ランキングを取得。未公開/不存在なら null。 */
export function getWeeklyRankingsByKey(weekKey: string): Promise<WeeklyRankings | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return Promise.resolve(null)
  return fetchWeek(weekKey)
}

/** アーカイブ用: 公開済みの週キー一覧（新しい順）。 */
export async function listWeeklyWeekKeys(limit = 52): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_rankings')
    .select('week_key')
    .eq('ranking_type', 'actress')  // 週ごとに1行に絞る（actressは必ず存在）
    .order('week_key', { ascending: false })
    .limit(limit * 10)
  const seen = new Set<string>()
  for (const r of (data ?? []) as { week_key: string }[]) seen.add(r.week_key)
  return [...seen].slice(0, limit)
}
