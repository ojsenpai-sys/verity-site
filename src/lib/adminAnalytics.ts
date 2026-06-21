// 管理ダッシュボード専用の集計取得層（server-only）。
// service-role クライアントを本ファイルに隔離し、page からは関数だけ呼ぶ。
// 参照は **事前集計（daily_metrics / *_summary / *_popularity / *_profiles）のみ**。
// raw user_events を表示時に走査しない。返すのは集計値だけ（PIIなし）。
// DDL 未適用や一時エラーでも UI を壊さないよう、失敗時は 0/空で返す。

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const BRAND = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
const jstDate    = (offsetDays = 0) =>
  new Date(Date.now() + 9 * 3_600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10)
// JST カレンダー日の 00:00 を UTC ISO で返す（DAU/WAU/MAU をカレンダー基準に統一するため）
// offsetDays=0: 当日, 6: 7日前の00:00（過去7日窓）, 29: 30日前（過去30日窓）
const jstDayStartIso = (offsetDays = 0) => {
  const j = new Date(Date.now() + 9 * 3_600_000)
  const utcMidnightJst = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate() - offsetDays)
  return new Date(utcMidnightJst - 9 * 3_600_000).toISOString()
}
const n   = (v: unknown) => Number(v ?? 0) || 0
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
const r1  = (x: number) => Math.round(x * 10) / 10

// 任意の count クエリ(head:true)を安全に数値化。builder は loose 型のため any 受け。
async function toCount(q: unknown): Promise<number> {
  try { const { count } = await (q as Promise<{ count: number | null }>); return count ?? 0 }
  catch { return 0 }
}

export type DailyRow = {
  date: string; new_users: number; total_members: number; dau: number
  work_views: number; actress_views: number; fanza_clicks: number
  fav_works: number; fav_actresses: number; total_events: number
}
const sumSince = (rows: DailyRow[], key: keyof DailyRow, from: string) =>
  rows.filter(r => r.date >= from).reduce((s, r) => s + n(r[key]), 0)
const sumAll = (rows: DailyRow[], key: keyof DailyRow) => rows.reduce((s, r) => s + n(r[key]), 0)

export async function getDailyMetrics(): Promise<DailyRow[]> {
  const c = db(); if (!c) return []
  try {
    const { data } = await c.from('daily_metrics').select('*').order('date', { ascending: true })
    return (data ?? []) as DailyRow[]
  } catch { return [] }
}

// ── Overview ─────────────────────────────────────────────────────────────────
export async function getOverview(daily: DailyRow[]) {
  const c = db()
  const totalMembers = c ? await toCount(c.from('profiles').select('*', { count: 'exact', head: true }).eq('brand_id', BRAND)) : 0
  // JSTカレンダー基準・会員(user_id NOT NULL=UAS)ベース。daily_metrics.dau と同一定義に統一。
  const activeSince = (offsetDays: number) =>
    c ? toCount(c.from('user_activity_summary').select('*', { count: 'exact', head: true }).gte('last_event_at', jstDayStartIso(offsetDays))) : Promise.resolve(0)
  const [dau, wau, mau] = await Promise.all([activeSince(0), activeSince(6), activeSince(29)])
  return {
    totalMembers,
    newToday: sumSince(daily, 'new_users', jstDate(0)),
    new7d:    sumSince(daily, 'new_users', jstDate(6)),
    new30d:   sumSince(daily, 'new_users', jstDate(29)),
    dau, wau, mau,
    loginRate:  pct(dau, totalMembers),
    stickiness: pct(dau, mau),
  }
}

// ── Engagement ───────────────────────────────────────────────────────────────
export async function getEngagement(daily: DailyRow[]) {
  const c = db()
  const [favWorks, favActresses, totalMembers, mau] = await Promise.all([
    c ? toCount(c.from('favorite_articles').select('*', { count: 'exact', head: true })) : Promise.resolve(0),
    c ? toCount(c.from('favorite_actresses').select('*', { count: 'exact', head: true })) : Promise.resolve(0),
    c ? toCount(c.from('profiles').select('*', { count: 'exact', head: true }).eq('brand_id', BRAND)) : Promise.resolve(0),
    c ? toCount(c.from('user_activity_summary').select('*', { count: 'exact', head: true }).gte('last_event_at', isoDaysAgo(30))) : Promise.resolve(0),
  ])
  const totalViews = sumAll(daily, 'work_views')
  return {
    favWorks, favActresses, totalViews,
    avgViewsPerUser: mau > 0 ? r1(totalViews / mau) : 0,
    avgFavsPerUser:  totalMembers > 0 ? r1((favWorks + favActresses) / totalMembers) : 0,
  }
}

// ── FANZA ────────────────────────────────────────────────────────────────────
export type PopWork    = { external_id: string; title: string; slug: string | null; image_url: string | null; score_30d: number }
export type PopActress = { external_id: string; name: string; image_url: string | null; score_30d: number }
export async function getFanza(daily: DailyRow[]) {
  const c = db()
  let popularWorks: PopWork[] = [], popularActresses: PopActress[] = []
  if (c) {
    try {
      const { data } = await c.from('content_popularity').select('external_id,title,slug,image_url,score_30d').order('score_30d', { ascending: false, nullsFirst: false }).limit(20)
      popularWorks = (data ?? []) as PopWork[]
    } catch { /* view missing */ }
    try {
      const { data } = await c.from('actress_popularity').select('external_id,name,image_url,score_30d').order('score_30d', { ascending: false, nullsFirst: false }).limit(20)
      popularActresses = (data ?? []) as PopActress[]
    } catch { /* view missing */ }
  }
  const totalClicks = sumAll(daily, 'fanza_clicks')
  const viewsDenom  = sumAll(daily, 'work_views') + sumAll(daily, 'actress_views')
  return {
    totalClicks,
    clicksToday: sumSince(daily, 'fanza_clicks', jstDate(0)),
    clicks7d:    sumSince(daily, 'fanza_clicks', jstDate(6)),
    ctr: pct(totalClicks, viewsDenom),
    popularWorks, popularActresses,
  }
}

// ── Tags ─────────────────────────────────────────────────────────────────────
export type TagRow = { tag: string; score_30d: number; score_7d: number; rising: number; score_prior7d: number }
export async function getTags() {
  const c = db(); if (!c) return { popular: [] as TagRow[], rising: [] as TagRow[] }
  let popular: TagRow[] = [], rising: TagRow[] = []
  try {
    const { data } = await c.from('tag_popularity').select('tag,score_30d,score_7d,rising,score_prior7d').order('score_30d', { ascending: false, nullsFirst: false }).limit(50)
    popular = (data ?? []) as TagRow[]
  } catch { /* missing */ }
  try {
    const { data } = await c.from('tag_popularity').select('tag,score_30d,score_7d,rising,score_prior7d').gt('score_7d', 0).order('rising', { ascending: false, nullsFirst: false }).limit(20)
    rising = (data ?? []) as TagRow[]
  } catch { /* missing */ }
  return { popular, rising }
}

// ── Preference（匿名集計のみ） ─────────────────────────────────────────────────
export type PrefSlice = { tag: string; pct: number }
export async function getPreference(): Promise<PrefSlice[]> {
  const c = db(); if (!c) return []
  try {
    const { data } = await c.rpc('get_preference_distribution', { p_limit: 12 })
    const rows = (data ?? []) as { tag: string; total: number }[]
    const sum = rows.reduce((s, r) => s + n(r.total), 0)
    return rows.map(r => ({ tag: r.tag, pct: pct(n(r.total), sum) }))
  } catch { return [] }
}

// ── Investor Metrics ───────────────────────────────────────────────────────────
export type Investor = {
  registeredMembers: number; mau: number; favoriteTotal: number; monthlyEvents: number
  workSaveRate: number; actressFollowRate: number; favoriteUtilization: number
  avgDepth: number; fanzaReferrals: number; fanzaCtr: number; retention7d: number; stickiness: number
  coverage: { works: number; actresses: number; tags: number }
}
export async function getInvestor(daily: DailyRow[]): Promise<Investor> {
  const c = db()
  const [totalMembers, mau, dau] = await Promise.all([
    c ? toCount(c.from('profiles').select('*', { count: 'exact', head: true }).eq('brand_id', BRAND)) : Promise.resolve(0),
    c ? toCount(c.from('user_activity_summary').select('*', { count: 'exact', head: true }).gte('last_event_at', jstDayStartIso(29))) : Promise.resolve(0),
    c ? toCount(c.from('user_activity_summary').select('*', { count: 'exact', head: true }).gte('last_event_at', jstDayStartIso(0))) : Promise.resolve(0),
  ])

  let favAny = 0, favWork = 0, favActress = 0
  if (c) {
    try {
      const { data } = await c.rpc('get_favorite_user_stats')
      const row = (Array.isArray(data) ? data[0] : data) as { fav_any: number; fav_work: number; fav_actress: number } | null
      if (row) { favAny = n(row.fav_any); favWork = n(row.fav_work); favActress = n(row.fav_actress) }
    } catch { /* missing */ }
  }

  const [retDenom, retNumer] = await Promise.all([
    c ? toCount(c.from('user_activity_summary').select('*', { count: 'exact', head: true }).lte('first_event_at', isoDaysAgo(7))) : Promise.resolve(0),
    c ? toCount(c.from('user_activity_summary').select('*', { count: 'exact', head: true }).lte('first_event_at', isoDaysAgo(7)).gte('last_event_at', isoDaysAgo(7))) : Promise.resolve(0),
  ])

  const [works, actresses, tags] = await Promise.all([
    c ? toCount(c.from('articles').select('*', { count: 'exact', head: true }).eq('is_active', true)) : Promise.resolve(0),
    c ? toCount(c.from('actresses').select('*', { count: 'exact', head: true }).eq('is_active', true)) : Promise.resolve(0),
    c ? toCount(c.from('tag_popularity').select('*', { count: 'exact', head: true })) : Promise.resolve(0),
  ])

  const monthlyEvents = sumSince(daily, 'total_events', jstDate(29))
  return {
    registeredMembers: totalMembers, mau,
    favoriteTotal: favWork + favActress,
    monthlyEvents,
    workSaveRate:        pct(favWork, totalMembers),
    actressFollowRate:   pct(favActress, totalMembers),
    favoriteUtilization: pct(favAny, totalMembers),
    avgDepth:            mau > 0 ? r1(monthlyEvents / mau) : 0,
    fanzaReferrals:      sumAll(daily, 'fanza_clicks'),
    fanzaCtr:            pct(sumAll(daily, 'fanza_clicks'), sumAll(daily, 'work_views')), // FANZA送客率 = clicks/work_views
    retention7d:         pct(retNumer, retDenom),
    stickiness:          pct(dau, mau),
    coverage: { works, actresses, tags },
  }
}

// ── Cron Status（集計鮮度・成否） ───────────────────────────────────────────────
export type CronRow = { job_name: string; started_at: string; finished_at: string | null; status: string | null; duration_ms: number | null; error: string | null }
export async function getCronStatus(): Promise<CronRow[]> {
  const c = db(); if (!c) return []
  try {
    const { data } = await c.from('cron_status_latest').select('*')
    return ((data ?? []) as CronRow[]).sort((a, b) => a.job_name < b.job_name ? -1 : 1)
  } catch { return [] }
}

// ── Preference Weights（編集UI用の現値取得） ────────────────────────────────────
export type WeightRow = { event_name: string; weight: number }
export async function getPreferenceWeights(): Promise<WeightRow[]> {
  const c = db(); if (!c) return []
  try {
    const { data } = await c.from('preference_weights').select('event_name,weight').order('event_name')
    return (data ?? []) as WeightRow[]
  } catch { return [] }
}
