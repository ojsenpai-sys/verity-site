'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy, Crown, Flame, TrendingUp, Sparkles, ChevronRight } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass } from '@/lib/cidUtils'
import { withAffiliate } from '@/lib/affiliate'
import { getMakerById } from '@/lib/makers'
import type { WeeklyRankings, WeeklyRankingRow, WeeklyRankingType } from '@/lib/weeklyRankings'

// ── 小ヘルパー ──────────────────────────────────────────────────────────────────
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

function proxyImg(raw?: string, fallbackCid?: string): string | null {
  const clean = raw && !isBadImageUrl(raw) ? raw : null
  if (clean) return `/verity/api/proxy/image?url=${encodeURIComponent(toHighResPackageUrl(clean) ?? clean)}`
  if (fallbackCid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(fallbackCid, 'pl'))}`
  return null
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso)
    const p = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short' }).format(d)
    return p
  } catch { return iso.slice(0, 10) }
}
function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
  } catch { return iso.slice(0, 16) }
}

const TABS: { key: WeeklyRankingType; label: string; icon: React.ReactNode }[] = [
  { key: 'actress',  label: '女優',   icon: <Crown size={13} /> },
  { key: 'work',     label: '作品',   icon: <Trophy size={13} /> },
  { key: 'maker',    label: 'メーカー', icon: <Flame size={13} /> },
  { key: 'newcomer', label: '新人',   icon: <Sparkles size={13} /> },
  { key: 'rising',   label: '急上昇', icon: <TrendingUp size={13} /> },
]

function rankBadgeClass(rank: number): string {
  return rank === 1 ? 'bg-amber-400 text-amber-900 shadow-[0_0_14px_rgba(251,191,36,0.5)]'
    : rank === 2 ? 'bg-slate-300 text-slate-800'
    : rank === 3 ? 'bg-amber-700 text-amber-100'
    : 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-md px-1.5 text-[11px] font-black tabular-nums ${rankBadgeClass(rank)}`}>
      #{rank}
    </span>
  )
}

function ChangeBadge({ row }: { row: WeeklyRankingRow }) {
  // 急上昇タブは前週セッション0を NEW 扱い（metadata.is_new_vs_prev）
  const risingNew = row.ranking_type === 'rising' && row.metadata?.is_new_vs_prev === true
  if (row.is_new_entry || risingNew) {
    return <span className="rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white">NEW</span>
  }
  const c = row.rank_change ?? 0
  if (c > 0) return <span className="text-[10px] font-bold text-emerald-400">↑{c}</span>
  if (c < 0) return <span className="text-[10px] font-bold text-rose-400">↓{-c}</span>
  return <span className="text-[10px] text-[var(--text-muted)]">→</span>
}

// ── エンティティ別の表示情報を1つに正規化 ──────────────────────────────────────
type Display = {
  href: string | null          // サイト内リンク（null=リンク不可）
  degraded?: boolean           // maker等でリンク不能
  name: string
  image: string | null
  circle: boolean              // 円形(女優) or 矩形(作品/メーカー)
  sub: string                  // サブ情報
  fanzaUrl?: string | null
  fanzaCid?: string
}

function toDisplay(row: WeeklyRankingRow): Display {
  const md = row.metadata ?? {}
  const readers = `${row.unique_sessions.toLocaleString()}人が閲覧`

  if (row.ranking_type === 'work') {
    const cid = str(md.representative_cid)
    const fanza = withAffiliate(str(md.fanza_url) ?? null)
    const maker = str(md.maker_name) ?? ''
    return {
      href: str(md.slug) ? `/verity/articles/${str(md.slug)}` : null,
      name: row.entity_name,
      image: proxyImg(str(md.image_url), cid),
      circle: false,
      sub: [str(md.actress_name), maker].filter(Boolean).join(' / ') || readers,
      fanzaUrl: fanza,
      fanzaCid: cid,
    }
  }

  if (row.ranking_type === 'maker') {
    const makerId = Number(str(md.maker_id) ?? row.entity_id)
    const known = Number.isFinite(makerId) ? getMakerById(makerId) : undefined
    return {
      href: known ? `/verity/makers/${makerId}` : null,
      degraded: !known,
      name: row.entity_name,
      image: proxyImg(str(md.rep_image_url), str(md.rep_cid)),
      circle: false,
      sub: str(md.rep_title) ? `代表作: ${str(md.rep_title)}` : readers,
    }
  }

  // actress / newcomer / rising は女優エンティティ
  const latestCid = str(md.latest_cid)
  let sub = readers
  if (row.ranking_type === 'newcomer') {
    const basis = str(md.newcomer_basis)
    const first = str(md.first_work_date)
    const label = basis === 'debut_year' ? 'デビュー' : basis === 'debut_work' ? '新人AVデビュー' : '初作品'
    sub = first ? `${label}: ${first}` : label
  } else if (row.ranking_type === 'rising') {
    const prev = num(md.previous_sessions) ?? 0
    const cur = num(md.current_sessions) ?? row.unique_sessions
    const rate = num(md.growth_rate)
    sub = `${prev}→${cur}人${rate ? `（×${rate}）` : ''}`
  }
  return {
    href: `/verity/actresses/${row.entity_id}`,
    name: row.entity_name,
    image: proxyImg(str(md.image_url), latestCid),
    circle: true,
    sub,
  }
}

// ── カード ──────────────────────────────────────────────────────────────────────
function EntityMedia({ d, rank, big }: { d: Display; rank: number; big?: boolean }) {
  const shape = d.circle ? 'rounded-full aspect-square' : 'rounded-xl aspect-[2/3]'
  return (
    <div className={`relative w-full overflow-hidden ${shape} border border-[var(--border)] bg-[var(--surface-2)] ${d.circle ? 'ring-1 ring-[var(--border)]' : ''}`}>
      {d.image ? (
        <ProxiedImage
          src={d.image}
          alt={d.name}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(d.image)}`}
        />
      ) : <NowPrinting />}
      <div className={`absolute ${big ? 'left-2 top-2' : 'left-1 top-1'}`}><RankBadge rank={rank} /></div>
    </div>
  )
}

function PodiumCard({ row, weekKey }: { row: WeeklyRankingRow; weekKey: string }) {
  const d = toDisplay(row)
  const onClick = () => trackEvent('weekly_ranking_entity_click', {
    weekKey, rankingType: row.ranking_type, rank: row.rank, entityId: row.entity_id, entityName: row.entity_name, position: 'weekly_podium',
  })
  const inner = (
    <>
      <EntityMedia d={d} rank={row.rank} big />
      <div className="mt-1.5 space-y-0.5">
        <p className="line-clamp-1 text-[13px] font-bold text-[var(--text)]">{d.name}</p>
        <p className="line-clamp-1 text-[10px] text-[var(--text-muted)]">{d.sub}</p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-black tabular-nums text-[var(--magenta)]">{row.unique_sessions.toLocaleString()}</span>
          <span className="text-[9px] text-[var(--text-muted)]">読者</span>
          <ChangeBadge row={row} />
        </div>
      </div>
    </>
  )
  return (
    <div className="flex flex-col">
      {d.href ? (
        <Link href={d.href} onClick={onClick} className="group block">{inner}</Link>
      ) : (
        <div className="opacity-95">{inner}</div>
      )}
      {row.ranking_type === 'work' && d.fanzaUrl && (
        <FanzaLink
          href={d.fanzaUrl}
          targetId={d.fanzaCid ?? row.entity_id}
          position="weekly_ranking_podium"
          onClick={() => trackEvent('weekly_ranking_fanza_click', { cid: d.fanzaCid, weekKey, rankingType: row.ranking_type, rank: row.rank, position: 'weekly_ranking_podium' })}
          className="mt-1 inline-flex items-center justify-center rounded-md bg-[var(--magenta)]/90 px-2 py-1 text-[10px] font-bold text-white hover:bg-[var(--magenta)]"
        >
          FANZAで見る
        </FanzaLink>
      )}
    </div>
  )
}

function CompactRow({ row, weekKey }: { row: WeeklyRankingRow; weekKey: string }) {
  const d = toDisplay(row)
  const onClick = () => trackEvent('weekly_ranking_entity_click', {
    weekKey, rankingType: row.ranking_type, rank: row.rank, entityId: row.entity_id, entityName: row.entity_name, position: 'weekly_list',
  })
  const media = (
    <div className={`relative shrink-0 overflow-hidden ${d.circle ? 'h-11 w-11 rounded-full' : 'h-14 w-10 rounded-md'} border border-[var(--border)] bg-[var(--surface-2)]`}>
      {d.image ? (
        <ProxiedImage src={d.image} alt={d.name} loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(d.image)}`} />
      ) : <NowPrinting />}
    </div>
  )
  const body = (
    <>
      <span className="w-7 shrink-0 text-center"><RankBadge rank={row.rank} /></span>
      {media}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[12px] font-semibold text-[var(--text)]">{d.name}</p>
        <p className="line-clamp-1 text-[10px] text-[var(--text-muted)]">{d.sub}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[12px] font-black tabular-nums text-[var(--text)]">{row.unique_sessions.toLocaleString()}<span className="ml-0.5 text-[8px] font-normal text-[var(--text-muted)]">読者</span></span>
        <ChangeBadge row={row} />
      </div>
    </>
  )
  return d.href ? (
    <Link href={d.href} onClick={onClick} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[var(--surface-2)]">{body}</Link>
  ) : (
    <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">{body}</div>
  )
}

// ── 作品カード（ArticleCard 風・縦長パッケージ／作品タブ専用）────────────────────
// 人物系(女優/新人/急上昇)の円形アバターとは別に、作品はサイト共通の作品カードと同じ
// aspect-[2/3] 縦長パッケージ（表紙右トリミング）で表示し、デザインを統一する。
function WorkCard({ row, weekKey }: { row: WeeklyRankingRow; weekKey: string }) {
  const d = toDisplay(row)
  const onClick = () => trackEvent('weekly_ranking_entity_click', {
    weekKey, rankingType: row.ranking_type, rank: row.rank, entityId: row.entity_id, entityName: row.entity_name, position: 'weekly_work_card',
  })
  const media = (
    <div className="relative w-full aspect-[2/3] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
      {d.image ? (
        <ProxiedImage
          src={d.image}
          alt={d.name}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(d.image)} transition-transform duration-300 ease-out group-hover:scale-105`}
        />
      ) : <NowPrinting />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
      <div className="absolute left-1.5 top-1.5"><RankBadge rank={row.rank} /></div>
      <div className="absolute right-1.5 top-1.5"><ChangeBadge row={row} /></div>
    </div>
  )
  return (
    <div className="flex flex-col">
      {d.href ? (
        <Link href={d.href} onClick={onClick} className="group block">{media}</Link>
      ) : (
        <div className="group">{media}</div>
      )}
      <p className="mt-1.5 line-clamp-2 text-[12px] font-bold leading-snug text-[var(--text)]">{d.name}</p>
      <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--text-muted)]">{d.sub}</p>
      <div className="mt-0.5 flex items-center gap-1">
        <span className="text-[12px] font-black tabular-nums text-[var(--magenta)]">{row.unique_sessions.toLocaleString()}</span>
        <span className="text-[9px] text-[var(--text-muted)]">読者</span>
      </div>
      {d.fanzaUrl && (
        <FanzaLink
          href={d.fanzaUrl}
          targetId={d.fanzaCid ?? row.entity_id}
          position="weekly_ranking_work_card"
          onClick={() => trackEvent('weekly_ranking_fanza_click', { cid: d.fanzaCid, weekKey, rankingType: row.ranking_type, rank: row.rank, position: 'weekly_ranking_work_card' })}
          className="mt-1 inline-flex items-center justify-center rounded-md bg-[var(--magenta)]/90 px-2 py-1 text-[10px] font-bold text-white hover:bg-[var(--magenta)]"
        >
          FANZAで見る
        </FanzaLink>
      )}
    </div>
  )
}

// ── メイン ────────────────────────────────────────────────────────────────────
export function WeeklyRankingsTabs({ data, showArchiveLink = true }: { data: WeeklyRankings; showArchiveLink?: boolean }) {
  const [active, setActive] = useState<WeeklyRankingType>('actress')
  const rows = data.rankings[active] ?? []
  const top3 = rows.filter((r) => r.rank <= 3)
  const rest = rows.filter((r) => r.rank >= 4)

  // 新人タブ: fallback判定が多い場合はサブタイトルを緩める（修正2）
  const newcomerFallbackShare = (() => {
    const nl = data.rankings.newcomer ?? []
    if (nl.length === 0) return 0
    return nl.filter((r) => r.metadata?.newcomer_basis === 'first_work_fallback').length / nl.length
  })()
  const subtitle: Record<WeeklyRankingType, string> = {
    actress: '今週 VERITY で最も読まれた女優',
    work: '今週最も読まれた作品',
    maker: '今週の人気メーカー',
    newcomer: newcomerFallbackShare >= 0.5 ? 'VERITY収録データをもとにした新人・注目女優ランキング' : '新人女優ランキング',
    rising: '前週から読者数が伸びた女優',
  }

  const changeTab = (key: WeeklyRankingType) => {
    setActive(key)
    trackEvent('weekly_ranking_tab_view', { weekKey: data.weekKey, rankingType: key, position: 'weekly_rankings_home' })
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-[var(--magenta)] text-white">
            <Trophy size={16} />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-[var(--text)] sm:text-lg">VERITY WEEKLY RANKINGS</h2>
            <p className="text-[10px] font-medium text-[var(--magenta)]">毎週日曜 23:30 発表</p>
          </div>
        </div>
        {showArchiveLink && (
          <Link href="/verity/rankings/weekly" className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
            詳細を見る <ChevronRight size={12} />
          </Link>
        )}
      </div>

      {/* 集計期間 / 公開日時 */}
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        集計期間 {fmtDate(data.periodStart)}〜{fmtDate(data.periodEnd)} ・ 確定 {fmtDateTime(data.publishedAt)}
      </p>

      {/* タブ */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
              active === t.key
                ? 'bg-[var(--magenta)] text-white'
                : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-[11px] font-semibold text-[var(--text)]">{subtitle[active]}</p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--text-muted)]">このランキングは集計データが揃い次第表示されます</p>
      ) : active === 'work' ? (
        /* 作品タブ: サイト共通の作品カードと統一した縦長パッケージ（表紙右）カード */
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {rows.map((r) => <WorkCard key={r.entity_id} row={r} weekKey={data.weekKey} />)}
        </div>
      ) : (
        <>
          {/* 1〜3位（強調） */}
          {top3.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2.5 sm:gap-3">
              {top3.map((r) => <PodiumCard key={r.entity_id} row={r} weekKey={data.weekKey} />)}
            </div>
          )}
          {/* 4〜10位（コンパクト） */}
          {rest.length > 0 && (
            <div className="mt-2 divide-y divide-[var(--border)]/60">
              {rest.map((r) => <CompactRow key={r.entity_id} row={r} weekKey={data.weekKey} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
