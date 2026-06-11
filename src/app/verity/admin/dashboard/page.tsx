export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Activity, BarChart3, TrendingUp, Zap, Users, Crown, MousePointerClick, Flame, Trophy } from 'lucide-react'

export const metadata: Metadata = { title: 'Analytics V2 — VERITY Admin' }

// ── 定数 ──────────────────────────────────────────────────────────────────────
const EVENT_KEYS = [
  'signup_start',
  'signup_complete',
  'actress_view',
  'video_view',
  'fanza_click',
] as const
type EventKey = (typeof EVENT_KEYS)[number]

const EVENT_CONFIG: Record<EventKey, { label: string; color: string }> = {
  signup_start:    { label: '登録開始',      color: '#aaff00' },
  signup_complete: { label: '登録完了',      color: '#00ffc8' },
  actress_view:    { label: '女優閲覧',      color: '#22ccff' },
  video_view:      { label: '作品閲覧',      color: '#aa77ff' },
  fanza_click:     { label: 'FANZAクリック', color: '#ff5533' },
}

// Position ラベル（Phase 1〜5 + Phase 2 新設 4導線）
const POSITION_LABELS: Record<string, string> = {
  card_image:              'カード画像',
  card_cta:                'カードCTA',
  hero_image:              'ヒーロー画像',
  hero_cta:                'ヒーローCTA',
  actress_sale_card:       '女優セールカード',
  actress_sale_search:     '女優セール検索CTA',
  fav_alert:               'お気に入りアラート',
  gentleman_recom:         'ジェントルマン推薦',
  lp_ranking_actress:      'LP長者番付',
  point_nudge:             'ポイントナッジ',
  grid_top3:               'Top3グリッド',
  card_premium_vr:         'VRプレミアムCTA',
  card_premium_dvd:        'DVDプレミアムCTA',
  // Phase 2 新設
  actress_maker_video:     '女優詳細：同メーカー作品',
  actress_related_actress: '女優詳細：関連女優リンク',
  actress_popular_video:   '女優詳細：人気作品セクション',
  actress_large_cta:       '女優詳細：最下部マゼンタ大CTA',
  // Phase 5 新設
  actress_fav_lock:        '女優詳細：未ログインお気に入りロック',
  profile_fav_actress:     'マイページ：お気に入り女優クリック',
  profile_history_click:   'マイページ：閲覧履歴クリック',
  // その他（旧）
  actress_page_latest:     '女優詳細：注目作品（旧）',
  actress_page_maker:      '女優詳細：同メーカー（旧）',
}

// Donut カラーパレット
const DONUT_COLORS = ['#aaff00', '#ff5533', '#00ffc8', '#aa77ff', '#22ccff', '#fbbf24', '#ff6eb4', '#a3e635']

// ── JST 直近14日を生成 ─────────────────────────────────────────────────────────
function getLast14Days(): string[] {
  const days: string[] = []
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  for (let i = 13; i >= 0; i--) {
    const d = new Date(jstNow.getTime() - i * 24 * 60 * 60 * 1000)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

// ── SVG ドーナツチャート（インライン・依存ゼロ） ───────────────────────────────
function DonutChart({
  segments,
  total,
}: {
  segments: { pct: number; color: string; label: string }[]
  total: number
}) {
  const R = 38
  const C = 2 * Math.PI * R

  let accOffset = 0
  const arcs = segments.map((s) => {
    const len    = (s.pct / 100) * C
    const offset = -accOffset
    accOffset   += len
    return { ...s, len, offset }
  })

  return (
    <svg width="110" height="110" viewBox="0 0 110 110" className="shrink-0">
      <circle cx="55" cy="55" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="13" />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx="55" cy="55" r={R}
          fill="none"
          stroke={arc.color}
          strokeWidth="13"
          strokeDasharray={`${arc.len} ${C}`}
          strokeDashoffset={arc.offset}
          transform="rotate(-90 55 55)"
          style={{ filter: i === 0 ? `drop-shadow(0 0 6px ${arc.color}80)` : 'none' }}
        />
      ))}
      <text x="55" y="50" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="13" fontWeight="800">
        {total > 999 ? `${(total / 1000).toFixed(1)}k` : String(total)}
      </text>
      <text x="55" y="64" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontWeight="600">
        CLICKS
      </text>
    </svg>
  )
}

// ── ページ ────────────────────────────────────────────────────────────────────
export default async function AnalyticsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = periodParam === '30' ? 30 : periodParam === '90' ? 90 : 7

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const days   = getLast14Days()
  const since  = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString()
  const h24Ago = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // ── バッチ1: イベント一括取得 ─────────────────────────────────────────────
  const [eventsRes, actressViewsRes] = await Promise.all([
    supabase
      .from('user_events')
      .select('event_name, created_at, metadata, target_id')
      .gte('created_at', since)
      .in('event_name', [...EVENT_KEYS]),
    supabase
      .from('user_events')
      .select('target_id')
      .eq('event_name', 'actress_view')
      .gte('created_at', h24Ago),
  ])

  if (eventsRes.error) console.error('[analytics/dashboard]', eventsRes.error.message)

  type EventRow = {
    event_name: string
    created_at: string
    metadata:   Record<string, unknown> | null
    target_id:  string | null
  }

  // ── バッチ1集計 ───────────────────────────────────────────────────────────
  const dailyData: Record<string, Record<string, number>> = {}
  const totals:    Record<string, number> = Object.fromEntries(EVENT_KEYS.map(k => [k, 0]))
  const positions14d: Record<string, number>  = {}
  const currentWeekPos: Record<string, number>  = {}
  const previousWeekPos: Record<string, number> = {}
  const recentClickMap: Record<string, number>  = {}
  const h24AgoDate = new Date(h24Ago)

  // 売上期待スコア用マップ
  const periodActressViewMap: Record<string, number> = {}  // 期間内の actress_view (target_id = actress ext_id)
  const videoViewMap   = new Map<string, number>()          // article ext_id → video_view 回数
  const fanzaClickMap  = new Map<string, number>()          // article ext_id → fanza_click 回数

  for (const raw of (eventsRes.data ?? []) as EventRow[]) {
    const jstTs = new Date(new Date(raw.created_at).getTime() + 9 * 60 * 60 * 1000)
    const day   = jstTs.toISOString().slice(0, 10)

    if (!dailyData[day]) dailyData[day] = {}
    dailyData[day][raw.event_name] = (dailyData[day][raw.event_name] ?? 0) + 1
    totals[raw.event_name] = (totals[raw.event_name] ?? 0) + 1

    if (raw.event_name === 'actress_view' && raw.target_id) {
      periodActressViewMap[raw.target_id] = (periodActressViewMap[raw.target_id] ?? 0) + 1
    }

    if (raw.event_name === 'video_view' && raw.target_id) {
      videoViewMap.set(raw.target_id, (videoViewMap.get(raw.target_id) ?? 0) + 1)
    }

    if (raw.event_name === 'fanza_click') {
      const pos = (raw.metadata?.position as string) ?? '(unknown)'
      positions14d[pos] = (positions14d[pos] ?? 0) + 1

      const dayIdx = days.indexOf(day)
      if (dayIdx >= 7)      currentWeekPos[pos]  = (currentWeekPos[pos]  ?? 0) + 1
      else if (dayIdx >= 0) previousWeekPos[pos] = (previousWeekPos[pos] ?? 0) + 1

      if (new Date(raw.created_at) >= h24AgoDate && raw.target_id) {
        recentClickMap[raw.target_id] = (recentClickMap[raw.target_id] ?? 0) + 1
      }

      if (raw.target_id) {
        fanzaClickMap.set(raw.target_id, (fanzaClickMap.get(raw.target_id) ?? 0) + 1)
      }
    }
  }

  // 24h 女優閲覧ランキング用
  const actressViewMap: Record<string, number> = {}
  for (const row of (actressViewsRes.data ?? []) as { target_id: string | null }[]) {
    if (row.target_id) actressViewMap[row.target_id] = (actressViewMap[row.target_id] ?? 0) + 1
  }

  const top10Ids      = Object.entries(actressViewMap).sort(([, a], [, b]) => b - a).slice(0, 10).map(([id]) => id)
  const top5ClickIds  = Object.entries(recentClickMap).sort(([, a], [, b]) => b - a).slice(0, 5).map(([id]) => id)

  // 売上期待スコア算出用: 上位100記事（重み付きスコア順）
  const topArticleIds = [...new Set([...videoViewMap.keys(), ...fanzaClickMap.keys()])]
    .sort((a, b) => {
      const sb = (videoViewMap.get(b) ?? 0) * 3 + (fanzaClickMap.get(b) ?? 0) * 20
      const sa = (videoViewMap.get(a) ?? 0) * 3 + (fanzaClickMap.get(a) ?? 0) * 20
      return sb - sa
    })
    .slice(0, 100)

  // ── バッチ2: 女優名 + 記事データ並列取得 ─────────────────────────────────
  const [actressDataRes, topArticlesRes, scoreArticlesRes] = await Promise.all([
    top10Ids.length > 0
      ? supabase.from('actresses').select('external_id, name, twitter_screen_name').in('external_id', top10Ids)
      : Promise.resolve({ data: [] }),
    top5ClickIds.length > 0
      ? supabase.from('articles').select('external_id, title, image_url').in('external_id', top5ClickIds)
      : Promise.resolve({ data: [] }),
    topArticleIds.length > 0
      ? supabase.from('articles').select('external_id, metadata').in('external_id', topArticleIds)
      : Promise.resolve({ data: [] }),
  ])

  // ── 24h 女優ランキング構築 ────────────────────────────────────────────────
  type ActressRankItem = { rank: number; id: string; name: string; twitter: string | null; count: number }
  const nameMap: Record<string, { name: string; twitter: string | null }> = {}
  for (const a of (actressDataRes.data ?? []) as { external_id: string; name: string; twitter_screen_name: string | null }[]) {
    nameMap[a.external_id] = { name: a.name, twitter: a.twitter_screen_name ?? null }
  }
  const actressRanking: ActressRankItem[] = Object.entries(actressViewMap)
    .sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([id, count], i) => ({
      rank: i + 1, id,
      name:    nameMap[id]?.name    ?? id.replace('dmm-actress-', '#'),
      twitter: nameMap[id]?.twitter ?? null,
      count,
    }))

  // ── 24h 最多クリック記事 TOP5 ─────────────────────────────────────────────
  type TopArt = { external_id: string; title: string; image_url: string | null }
  const artMap = new Map<string, TopArt>(
    ((topArticlesRes.data ?? []) as TopArt[]).map(a => [a.external_id, a])
  )
  const topArticles = top5ClickIds
    .map((id, i) => ({ rank: i + 1, clicks: recentClickMap[id] ?? 0, art: artMap.get(id) }))
    .filter(r => r.art)

  // ── 売上期待スコア算出 ─────────────────────────────────────────────────────
  // article metadata.actress ([{id, name}]) からスコアを女優に帰属
  type ScoreEntry = { views: number; videoViews: number; fanzaClicks: number }
  const actressScoreMap = new Map<string, ScoreEntry>()

  // actress_view（直接）
  for (const [extId, cnt] of Object.entries(periodActressViewMap)) {
    const s = actressScoreMap.get(extId) ?? { views: 0, videoViews: 0, fanzaClicks: 0 }
    s.views += cnt
    actressScoreMap.set(extId, s)
  }

  // video_view / fanza_click（記事経由で女優に帰属）
  for (const art of (scoreArticlesRes.data ?? []) as { external_id: string; metadata: Record<string, unknown> | null }[]) {
    const actressMeta = art.metadata?.actress
    if (!Array.isArray(actressMeta)) continue

    const vv  = videoViewMap.get(art.external_id)  ?? 0
    const fc  = fanzaClickMap.get(art.external_id) ?? 0
    if (vv === 0 && fc === 0) continue

    for (const a of actressMeta as { id: number; name: string }[]) {
      if (!a?.id) continue
      const extId = `dmm-actress-${a.id}`
      const s = actressScoreMap.get(extId) ?? { views: 0, videoViews: 0, fanzaClicks: 0 }
      s.videoViews  += vv
      s.fanzaClicks += fc
      actressScoreMap.set(extId, s)
    }
  }

  // スコア = view×1 + videoView×3 + fanzaClick×20
  type RevenueRankRaw = { id: string; score: number; views: number; videoViews: number; fanzaClicks: number }
  const revenueRaw: RevenueRankRaw[] = [...actressScoreMap.entries()]
    .map(([id, s]) => ({
      id,
      score:       s.views * 1 + s.videoViews * 3 + s.fanzaClicks * 20,
      views:       s.views,
      videoViews:  s.videoViews,
      fanzaClicks: s.fanzaClicks,
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  // ── バッチ3: 売上ランキング用女優名取得 ──────────────────────────────────
  const revenueTop20Ids = revenueRaw.map(r => r.id)
  const missingIds      = revenueTop20Ids.filter(id => !nameMap[id])
  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('actresses')
      .select('external_id, name, twitter_screen_name')
      .in('external_id', missingIds)
    for (const a of (extra ?? []) as { external_id: string; name: string; twitter_screen_name: string | null }[]) {
      nameMap[a.external_id] = { name: a.name, twitter: a.twitter_screen_name ?? null }
    }
  }

  type RevenueRankItem = RevenueRankRaw & { name: string; twitter: string | null }
  const revenueRanking: RevenueRankItem[] = revenueRaw.map(r => ({
    ...r,
    name:    nameMap[r.id]?.name    ?? r.id.replace('dmm-actress-', '女優 #'),
    twitter: nameMap[r.id]?.twitter ?? null,
  }))

  const maxScore = revenueRanking[0]?.score ?? 1

  // ── 位置別ランキング ──────────────────────────────────────────────────────
  const posRanking = Object.entries(positions14d)
    .sort(([, a], [, b]) => b - a).slice(0, 15)
  const maxPos            = posRanking[0]?.[1] ?? 1
  const totalPosClicks    = Object.values(positions14d).reduce((a, b) => a + b, 0)
  const currentWeekTotal  = Object.values(currentWeekPos).reduce((a, b) => a + b, 0)
  const previousWeekTotal = Object.values(previousWeekPos).reduce((a, b) => a + b, 0)

  const donutSegments = posRanking.slice(0, 7).map(([, cnt], i) => ({
    pct:   totalPosClicks > 0 ? (cnt / totalPosClicks) * 100 : 0,
    color: DONUT_COLORS[i] ?? '#555',
    label: '',
  }))
  if (totalPosClicks > 0) {
    const shown = donutSegments.reduce((s, d) => s + d.pct, 0)
    if (shown < 100) donutSegments.push({ pct: 100 - shown, color: 'rgba(255,255,255,0.06)', label: 'その他' })
  }

  // ── その他集計 ────────────────────────────────────────────────────────────
  const totalAll   = Object.values(totals).reduce((a, b) => a + b, 0)
  const signupRate = totals.signup_start > 0
    ? Math.round((totals.signup_complete / totals.signup_start) * 100) : null
  const maxActressCount = actressRanking[0]?.count ?? 1
  const fanzaWow = previousWeekTotal > 0
    ? Math.round(((currentWeekTotal - previousWeekTotal) / previousWeekTotal) * 100) : null

  const dateRange = `${days[0].slice(5).replace('-', '/')} 〜 ${days[13].slice(5).replace('-', '/')}`

  // ── レンダリング ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">

      {/* ── ヘッダー ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(170,255,0,0.12)', border: '1px solid rgba(170,255,0,0.3)' }}>
              <Activity size={15} style={{ color: '#aaff00' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight" style={{ color: '#aaff00' }}>
                  行動分析ダッシュボード
                </h1>
                <span className="rounded px-1.5 py-0.5 text-[8px] font-black tracking-widest uppercase" style={{ background: 'rgba(170,255,0,0.15)', color: '#aaff00', border: '1px solid rgba(170,255,0,0.3)' }}>
                  V2
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">日別チャート {dateRange}</p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg px-3 py-2 text-right" style={{ background: 'rgba(170,255,0,0.06)', border: '1px solid rgba(170,255,0,0.15)' }}>
            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest">Total Events</p>
            <p className="text-xl font-black tabular-nums" style={{ color: '#aaff00' }}>{totalAll.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-px w-full" style={{ background: 'linear-gradient(to right, #aaff00 0%, rgba(170,255,0,0.4) 25%, rgba(170,255,0,0.1) 60%, transparent 100%)' }} />
      </div>

      {/* ── 期間切替タブ ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mr-1">集計期間</span>
        {([7, 30, 90] as const).map(p => (
          <a
            key={p}
            href={`?period=${p}`}
            className="rounded-full px-3.5 py-1 text-xs font-bold transition-all"
            style={period === p
              ? { background: 'rgba(170,255,0,0.15)', border: '1px solid rgba(170,255,0,0.4)', color: '#aaff00' }
              : { border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }
            }
          >
            直近{p}日
          </a>
        ))}
      </div>

      {/* ── KPIカード ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {EVENT_KEYS.map(key => {
          const cfg  = EVENT_CONFIG[key]
          const peak = Math.max(...days.map(d => dailyData[d]?.[key] ?? 0), 0)
          return (
            <div key={key} className="rounded-xl p-4 space-y-2" style={{ background: `linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 92%, ${cfg.color}) 100%)`, border: `1px solid ${cfg.color}28` }}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{cfg.label}</p>
              <p className="text-3xl font-black tabular-nums leading-none" style={{ color: cfg.color }}>{totals[key].toLocaleString()}</p>
              <div className="h-px" style={{ background: `${cfg.color}35` }} />
              <p className="text-[9px] text-[var(--text-muted)]">
                ピーク <span className="font-bold tabular-nums" style={{ color: cfg.color }}>{peak.toLocaleString()}</span>
                <span className="opacity-60"> / 日</span>
              </p>
            </div>
          )
        })}
      </div>

      {/* ── 売上期待ランキング TOP20 ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#fbbf24' }}>
            <Trophy size={12} /> 売上期待ランキング TOP20（直近{period}日間）
          </h2>
          <div className="rounded px-2 py-1 text-[9px] font-mono" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: 'rgba(251,191,36,0.7)' }}>
            score = view×1 + video×3 + FANZA×20
          </div>
        </div>

        {revenueRanking.length === 0 ? (
          <div className="rounded-xl px-6 py-10 text-center" style={{ border: '1px solid rgba(251,191,36,0.15)', background: 'var(--surface)' }}>
            <Zap size={20} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm text-[var(--text-muted)]">この期間のデータがまだありません</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'var(--surface)' }}>
            {/* ヘッダー行 */}
            <div className="grid gap-x-2 border-b border-[var(--border)] px-5 py-2 text-[8px] uppercase tracking-widest text-[var(--text-muted)]"
              style={{ gridTemplateColumns: '1.5rem 1fr 4.5rem 4.5rem 4.5rem 6rem 5rem' }}>
              <span>#</span>
              <span>女優</span>
              <span className="text-right">女優閲覧</span>
              <span className="text-right">作品視聴</span>
              <span className="text-right">FANZA</span>
              <span className="text-center">スコアバー</span>
              <span className="text-right">SCORE</span>
            </div>

            {revenueRanking.map(({ id, name, twitter, score, views, videoViews, fanzaClicks }, i) => {
              const gold    = i === 0
              const top3    = i < 3
              const rankClr = gold ? '#fbbf24' : top3 ? '#fb923c' : 'rgba(255,255,255,0.4)'
              const barClr  = gold ? '#fbbf24' : top3 ? '#fb923c' : '#3d3020'
              return (
                <div
                  key={id}
                  className="grid gap-x-2 items-center px-5 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors"
                  style={{ gridTemplateColumns: '1.5rem 1fr 4.5rem 4.5rem 4.5rem 6rem 5rem', background: gold ? 'rgba(251,191,36,0.04)' : undefined }}
                >
                  <span className="text-xs font-black tabular-nums text-right" style={{ color: rankClr }}>{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: top3 ? rankClr : 'var(--text)' }}>{name}</p>
                    {twitter && <p className="text-[10px] text-[var(--text-muted)] truncate">@{twitter}</p>}
                  </div>
                  <span className="text-right text-[10px] tabular-nums text-[var(--text-muted)]">{views.toLocaleString()}</span>
                  <span className="text-right text-[10px] tabular-nums" style={{ color: '#aa77ff' }}>{videoViews.toLocaleString()}</span>
                  <span className="text-right text-[10px] tabular-nums font-bold" style={{ color: '#ff5533' }}>{fanzaClicks.toLocaleString()}</span>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${(score / maxScore) * 100}%`, backgroundColor: barClr, boxShadow: gold ? `0 0 8px ${barClr}80` : 'none' }} />
                  </div>
                  <span className="text-right text-xs font-black tabular-nums" style={{ color: rankClr }}>{score.toLocaleString()}</span>
                </div>
              )
            })}

            {/* スコア凡例フッター */}
            <div className="flex items-center gap-4 px-5 py-2" style={{ background: 'rgba(251,191,36,0.03)', borderTop: '1px solid var(--border)' }}>
              <span className="text-[9px] text-[var(--text-muted)]">重み付き合計スコア：</span>
              <span className="text-[9px]" style={{ color: '#22ccff' }}>女優閲覧 ×1</span>
              <span className="text-[9px]" style={{ color: '#aa77ff' }}>作品視聴 ×3</span>
              <span className="text-[9px] font-bold" style={{ color: '#ff5533' }}>FANZAクリック ×20</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 女優ランキング + 登録ファネル ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 女優ランキング TOP10（24h） */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#aaff00' }}>
            <Crown size={12} /> 女優ランキング（直近24h）
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(170,255,0,0.15)', background: 'var(--surface)' }}>
            {actressRanking.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Zap size={20} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm text-[var(--text-muted)]">データがありません</p>
              </div>
            ) : actressRanking.map(({ rank, name, twitter, count }) => {
              const rankColor = rank === 1 ? '#aaff00' : rank <= 3 ? '#00ffc8' : 'var(--text-muted)'
              const barColor  = rank === 1 ? '#aaff00' : rank <= 3 ? '#00ffc8' : '#334433'
              return (
                <div key={rank} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[var(--surface-2)]" style={rank === 1 ? { background: 'rgba(170,255,0,0.04)' } : {}}>
                  <span className="w-5 shrink-0 text-right text-xs font-black tabular-nums" style={{ color: rankColor }}>{rank}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: rank <= 3 ? rankColor : 'var(--text)' }}>{name}</p>
                    {twitter && <p className="text-[10px] text-[var(--text-muted)] truncate">@{twitter}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${(count / maxActressCount) * 100}%`, backgroundColor: barColor, boxShadow: rank === 1 ? `0 0 10px ${barColor}80` : 'none' }} />
                    </div>
                    <span className="w-7 text-right text-xs font-black tabular-nums" style={{ color: rankColor }}>{count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 登録ファネル */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#00ffc8' }}>
            <Users size={12} /> 登録ファネル（直近{period}日間）
          </h2>
          <div className="rounded-xl p-5 space-y-5" style={{ border: '1px solid rgba(0,255,200,0.15)', background: 'var(--surface)' }}>
            {[
              { label: '登録開始',  val: totals.signup_start,    color: '#aaff00', pct: 100 },
              { label: '登録完了', val: totals.signup_complete, color: '#00ffc8', pct: totals.signup_start > 0 ? (totals.signup_complete / totals.signup_start) * 100 : 0 },
            ].map(({ label, val, color, pct }) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
                  <span className="text-xl font-black tabular-nums" style={{ color }}>{val.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            ))}
            <p className="text-center text-xs text-[var(--text-muted)]">↓</p>
            <div className="rounded-lg px-4 py-4 text-center" style={{ background: 'rgba(0,255,200,0.06)', border: '1px solid rgba(0,255,200,0.15)' }}>
              <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mb-1">完了率</p>
              {signupRate !== null
                ? <p className="text-4xl font-black tabular-nums" style={{ color: '#00ffc8' }}>{signupRate}%</p>
                : <p className="text-xs text-[var(--text-muted)]">— データなし —</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── コンバージョン導線別パフォーマンス ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#ff5533' }}>
            <MousePointerClick size={12} /> コンバージョン導線別パフォーマンス（直近{period}日間）
          </h2>
          {fanzaWow !== null && period >= 14 && (
            <span className={[
              'rounded-full px-2.5 py-1 text-[10px] font-black border',
              fanzaWow >= 0
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400',
            ].join(' ')}>
              前週比 {fanzaWow >= 0 ? '↑' : '↓'} {Math.abs(fanzaWow)}%（7日間）
            </span>
          )}
        </div>

        {posRanking.length === 0 ? (
          <div className="rounded-xl px-6 py-10 text-center" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <Zap size={20} className="mx-auto mb-2 opacity-20" />
            <p className="text-sm text-[var(--text-muted)]">クリックデータがまだありません</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,85,51,0.2)', background: 'var(--surface)' }}>
            {/* ドーナツ + サマリー行 */}
            <div className="flex items-center gap-6 border-b border-[var(--border)] px-5 py-4" style={{ background: 'rgba(255,85,51,0.03)' }}>
              <DonutChart segments={donutSegments} total={totalPosClicks} />
              <div className="space-y-2">
                {posRanking.slice(0, 3).map(([pos, cnt], i) => {
                  const pct = totalPosClicks > 0 ? Math.round((cnt / totalPosClicks) * 100) : 0
                  return (
                    <div key={pos} className="flex items-center gap-2 text-[10px]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i] }} />
                      <span className="text-[var(--text-muted)]">{POSITION_LABELS[pos] ?? pos}</span>
                      <span className="ml-auto font-black tabular-nums" style={{ color: DONUT_COLORS[i] }}>{pct}%</span>
                    </div>
                  )
                })}
                <p className="text-[9px] text-[var(--text-muted)] pt-1">合計 {totalPosClicks.toLocaleString()} クリック</p>
              </div>
            </div>

            {/* ヘッダー行 */}
            <div className="grid grid-cols-[1.5rem_1fr_6rem_7rem_5rem_5rem] gap-x-3 border-b border-[var(--border)] px-5 py-2 text-[8px] uppercase tracking-widest text-[var(--text-muted)]">
              <span>#</span>
              <span>導線 (position)</span>
              <span className="text-right">クリック数</span>
              <span>バー</span>
              <span className="text-right">シェア</span>
              <span className="text-right">{period >= 14 ? '前週比' : '—'}</span>
            </div>

            {posRanking.map(([pos, cnt], rank) => {
              const pct       = totalPosClicks > 0 ? Math.round((cnt / totalPosClicks) * 100) : 0
              const rankColor = rank === 0 ? '#aaff00' : rank < 3 ? '#00ffc8' : 'var(--text-muted)'
              const barColor  = DONUT_COLORS[rank] ?? '#555'
              const curW      = currentWeekPos[pos]  ?? 0
              const prevW     = previousWeekPos[pos] ?? 0
              const wow       = period >= 14 && prevW > 0 ? Math.round(((curW - prevW) / prevW) * 100) : null
              return (
                <div key={pos} className="grid grid-cols-[1.5rem_1fr_6rem_7rem_5rem_5rem] gap-x-3 items-center px-5 py-2.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors">
                  <span className="text-xs font-black tabular-nums text-right" style={{ color: rankColor }}>{rank + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[var(--text)] truncate">
                      {POSITION_LABELS[pos] ?? pos}
                    </p>
                    <p className="text-[9px] font-mono text-[var(--text-muted)] truncate opacity-60">{pos}</p>
                  </div>
                  <span className="text-right text-xs font-black tabular-nums" style={{ color: rankColor }}>{cnt.toLocaleString()}</span>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(cnt / maxPos) * 100}%`, backgroundColor: barColor, boxShadow: rank === 0 ? `0 0 8px ${barColor}80` : 'none' }} />
                  </div>
                  <span className="text-right text-[10px] font-semibold tabular-nums" style={{ color: rankColor, opacity: 0.9 }}>{pct}%</span>
                  <span className={[
                    'text-right text-[10px] font-black tabular-nums',
                    wow === null ? 'text-[var(--text-muted)]' : wow >= 0 ? 'text-emerald-400' : 'text-red-400',
                  ].join(' ')}>
                    {wow === null ? '—' : `${wow >= 0 ? '↑' : '↓'}${Math.abs(wow)}%`}
                  </span>
                </div>
              )
            })}

            {/* 合計行 */}
            <div className="flex items-center justify-between px-5 py-2.5" style={{ background: 'rgba(255,85,51,0.04)', borderTop: '1px solid var(--border)' }}>
              <span className="text-[10px] text-[var(--text-muted)]">合計</span>
              <div className="flex items-center gap-6">
                <span className="text-xs font-black tabular-nums" style={{ color: '#ff5533' }}>{totalPosClicks.toLocaleString()}</span>
                <span className="text-[10px] font-semibold" style={{ color: '#ff5533', opacity: 0.85 }}>100%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 直近24h 最多クリック作品 ──────────────────────────────────────── */}
      {topArticles.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#fbbf24' }}>
            <Flame size={12} /> 直近24h 最多クリック作品（デイリーフラッシュ候補）
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'var(--surface)' }}>
            {topArticles.map(({ rank, clicks, art }) => (
              <div key={art!.external_id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors">
                <span className="w-5 shrink-0 text-right text-xs font-black tabular-nums" style={{ color: rank === 1 ? '#fbbf24' : 'var(--text-muted)' }}>{rank}</span>
                {art!.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/verity/api/proxy/image?url=${encodeURIComponent(art!.image_url)}`} alt="" className="h-10 w-7 shrink-0 rounded object-cover object-right" />
                )}
                <p className="flex-1 min-w-0 text-sm text-[var(--text)] truncate">{art!.title}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <MousePointerClick size={11} style={{ color: rank === 1 ? '#fbbf24' : 'var(--text-muted)' }} />
                  <span className="text-xs font-black tabular-nums" style={{ color: rank === 1 ? '#fbbf24' : 'var(--text-muted)' }}>{clicks}</span>
                </div>
              </div>
            ))}
            <p className="px-4 py-2 text-[9px] text-[var(--text-muted)] italic" style={{ borderTop: '1px solid var(--border)', background: 'rgba(251,191,36,0.03)' }}>
              ※ HeroSection の「TODAY&apos;S FLASH」は上記1位作品を自動表示します（cronフラグ未設定時）
            </p>
          </div>
        </div>
      )}

      {/* ── 日別推移チャート（常に直近14日） ────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#aaff00' }}>
          <TrendingUp size={12} /> 日別推移（直近14日）
        </h2>
        <div className="rounded-xl overflow-hidden divide-y divide-[var(--border)]" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {EVENT_KEYS.map(key => {
            const cfg    = EVENT_CONFIG[key]
            const values = days.map(d => dailyData[d]?.[key] ?? 0)
            const maxVal = Math.max(...values, 1)
            return (
              <div key={key} className="px-5 py-4 border-b border-[var(--border)] last:border-b-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
                    <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                    直近{period}日合計 <span className="font-bold" style={{ color: cfg.color }}>{totals[key].toLocaleString()}</span>
                  </span>
                </div>
                <div className="flex items-end gap-0.5 h-10">
                  {values.map((v, i) => (
                    <div key={days[i]} className="flex-1 rounded-t-[2px]" title={`${days[i]}: ${v.toLocaleString()}`}
                      style={{ height: v > 0 ? `${Math.max((v / maxVal) * 100, 5)}%` : '2px', backgroundColor: cfg.color, opacity: v === 0 ? 0.1 : 0.82 }} />
                  ))}
                </div>
                <div className="flex gap-0.5 mt-1.5">
                  {days.map((d, i) => (
                    <div key={d} className="flex-1 text-center">
                      {(i === 0 || i === 6 || i === 13) && (
                        <span className="text-[8px] text-[var(--text-muted)]">{d.slice(5).replace('-', '/')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── DBインデックス推奨 ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#aa77ff' }}>
          <BarChart3 size={12} /> DBインデックス推奨（Supabase SQL Editor で実行）
        </h2>
        <div className="rounded-xl p-5 space-y-1.5" style={{ border: '1px solid rgba(170,119,255,0.2)', background: 'var(--surface)' }}>
          <p className="text-[9px] text-[var(--text-muted)] mb-3">
            以下のSQLをSupabase SQL Editorで実行し、ログ集計クエリを高速化してください。
          </p>
          <pre className="overflow-x-auto rounded-lg p-4 text-[10px] leading-relaxed" style={{ background: 'rgba(0,0,0,0.4)', color: '#aa77ff', border: '1px solid rgba(170,119,255,0.15)' }}>{`-- user_events: event_name + created_at 複合インデックス（最頻出クエリ）
CREATE INDEX IF NOT EXISTS idx_user_events_name_created
  ON user_events (event_name, created_at DESC);

-- user_events: position 抽出用（JSONB GIN）
CREATE INDEX IF NOT EXISTS idx_user_events_metadata_gin
  ON user_events USING GIN (metadata);

-- user_events: target_id 集計（記事クリック数集計）
CREATE INDEX IF NOT EXISTS idx_user_events_target_id
  ON user_events (target_id) WHERE target_id IS NOT NULL;

-- articles: external_id 逆引き（売上スコア算出クエリ）
CREATE INDEX IF NOT EXISTS idx_articles_external_id
  ON articles (external_id);

-- sn_user_logs: brand × user × target_type（プロフィール + ジェントルマン分析）
CREATE INDEX IF NOT EXISTS idx_sn_user_logs_brand_user_type
  ON sn_user_logs (brand_id, user_id, target_type);

-- sn_favorite_actresses: brand × lp_points（LP長者番付集計）
CREATE INDEX IF NOT EXISTS idx_sn_fav_actresses_brand_lp
  ON sn_favorite_actresses (brand_id, lp_points DESC);`}</pre>
        </div>
      </div>

    </div>
  )
}
