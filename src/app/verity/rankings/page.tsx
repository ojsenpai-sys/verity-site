import type { Metadata } from 'next'
import Link from 'next/link'
import { Trophy, Flame, ChevronRight, TrendingUp, Crown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { FanzaLink } from '@/components/FanzaLink'
import {
  toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass,
} from '@/lib/cidUtils'
import {
  getAllArticleScores, getAllActressScores, type ScorePeriod,
} from '@/lib/articleScoring'
import type { Article, Actress } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  searchParams: Promise<{ period?: string }>
}

const PERIOD_LABEL: Record<ScorePeriod, string> = {
  '7d':   '今週 (7日)',
  '30d':  '今月 (30日)',
  '90d':  '今四半期 (90日)',
  '180d': '半期',
  '365d': '年間',
  'all':  '全期間',
}

const SUPPORTED_PERIODS: ScorePeriod[] = ['7d', '30d', '90d']

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return {
    title: 'ライブランキング — VERITY',
    description: '実ユーザー行動 (FANZA遷移・視聴・閲覧) を集計したリアルタイム・ランキング。今週/今月/今四半期の人気作品・人気女優・急上昇を可視化。',
    alternates: { canonical: `${siteUrl}/verity/rankings` },
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function proxyJacket(article: Pick<Article, 'image_url' | 'external_id'>): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  if (article.external_id) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
  return null
}

function proxyActressImg(actress: Pick<Actress, 'image_url' | 'metadata'>): string | null {
  const raw = isBadImageUrl(actress.image_url) ? null : actress.image_url
  if (raw) return `/verity/api/proxy/image?url=${encodeURIComponent(toHighResPackageUrl(raw) ?? raw)}`
  const cid = (actress.metadata as Record<string, unknown> | null)?.latest_cid as string | undefined
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

function articleFanzaUrl(article: Article): string | null {
  const m = article.metadata as Record<string, unknown> | null
  const raw =
    (typeof m?.affiliate_url === 'string' ? (m.affiliate_url as string) : null) ??
    (article.source === 'dmm' && typeof m?.url === 'string' ? (m.url as string) : null)
  return withAffiliate(raw)
}

// ─── rising algorithm ─────────────────────────────────────────────────────────

/**
 * 急上昇判定: recent/prior レシオ降順。recent>=3 の足切り。
 * scoresRecent と scoresPrior は同じ key 空間。
 */
function risingByRatio<K>(
  recent: Map<K, number>,
  prior:  Map<K, number>,
  minRecent = 3,
): Array<{ key: K; ratio: number; recent: number }> {
  const out: Array<{ key: K; ratio: number; recent: number }> = []
  for (const [k, r] of recent.entries()) {
    if (r < minRecent) continue
    const p = prior.get(k) ?? 0
    const ratio = p === 0 ? r * 2 : r / p
    if (ratio > 1.2) out.push({ key: k, ratio, recent: r })
  }
  return out.sort((a, b) => b.ratio - a.ratio)
}

// ─── data fetchers ────────────────────────────────────────────────────────────

async function fetchArticles(cids: string[]): Promise<Article[]> {
  if (cids.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .in('external_id', cids)
    .eq('is_active', true)
    .not('metadata->>url', 'like', '%/dc/doujin/%')
  return ((data ?? []) as Article[])
}

async function fetchActresses(externalIds: string[]): Promise<Actress[]> {
  if (externalIds.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('*')
    .in('external_id', externalIds)
    .eq('is_active', true)
  return ((data ?? []) as Actress[])
}

// ─── card components ─────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const styles =
    rank === 1 ? 'bg-amber-400 text-amber-900 shadow-[0_0_14px_rgba(251,191,36,0.5)]' :
    rank === 2 ? 'bg-slate-300 text-slate-800' :
    rank === 3 ? 'bg-amber-700 text-amber-100' :
                 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
  return (
    <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-md px-1.5 text-[11px] font-black tabular-nums ${styles}`}>
      #{rank}
    </span>
  )
}

function ArticleRankCard({ article, rank, badge }: { article: Article; rank: number; badge?: string }) {
  const img = proxyJacket(article)
  const fanza = articleFanzaUrl(article)
  const ImgEl = img ? (
    <ProxiedImage
      src={img}
      alt={article.title}
      className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(article.image_url)} transition-transform duration-300 group-hover/r:scale-105`}
    />
  ) : <NowPrinting />
  return (
    <div className="flex flex-col gap-1.5">
      {fanza ? (
        <FanzaLink
          href={fanza}
          targetId={article.external_id}
          position="rankings_page"
          className="group/r relative block aspect-[2/3] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] transition-all hover:border-[var(--magenta)]/55 hover:shadow-[0_0_20px_rgba(226,0,116,0.22)]"
        >
          {ImgEl}
          <div className="absolute left-1.5 top-1.5"><RankBadge rank={rank} /></div>
          {badge && (
            <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white shadow-md">
              <Flame size={8} /> {badge}
            </span>
          )}
        </FanzaLink>
      ) : (
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          {ImgEl}
          <div className="absolute left-1.5 top-1.5"><RankBadge rank={rank} /></div>
        </div>
      )}
      <Link href={`/verity/articles/${article.slug}`} className="line-clamp-2 text-[11px] font-medium text-[var(--text)] hover:text-[var(--magenta)] transition-colors">
        {article.title}
      </Link>
    </div>
  )
}

function ActressRankCard({ actress, rank, badge }: { actress: Actress; rank: number; badge?: string }) {
  const img = proxyActressImg(actress)
  return (
    <Link
      href={`/verity/actresses/${actress.external_id}`}
      className="group flex flex-col items-center gap-1.5 text-center"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-full ring-1 ring-[var(--border)] bg-[var(--surface-2)] transition-all duration-200 group-hover:ring-2 group-hover:ring-[var(--magenta)]/60 group-hover:shadow-[0_0_18px_rgba(226,0,116,0.3)]">
        {img ? (
          <ProxiedImage
            src={img}
            alt={actress.name}
            className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(actress.image_url)} transition-transform duration-300 group-hover:scale-110`}
          />
        ) : <div className="absolute inset-0 bg-[var(--surface-2)]" />}
        <div className="absolute left-1 top-1"><RankBadge rank={rank} /></div>
        {badge && (
          <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/95 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white shadow">
            <Flame size={8} /> {badge}
          </span>
        )}
      </div>
      <span className="line-clamp-1 text-[12px] font-semibold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors">
        {actress.name}
      </span>
    </Link>
  )
}

// ─── section assembler ────────────────────────────────────────────────────────

function Section({
  icon, title, accent, sub, children, empty,
}: {
  icon:     React.ReactNode
  title:    string
  accent:   string
  sub?:     string
  empty?:   string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${accent}`}>
          {icon}
        </span>
        <h2 className="text-base font-bold tracking-tight text-[var(--text)]">{title}</h2>
        {sub && <span className="text-[11px] text-[var(--text-muted)]">{sub}</span>}
      </div>
      {children ?? (
        <p className="text-sm text-[var(--text-muted)]">{empty ?? 'データが揃い次第表示されます'}</p>
      )}
    </section>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function RankingsPage({ searchParams }: PageProps) {
  const { period: rawPeriod } = await searchParams
  const period: ScorePeriod = (SUPPORTED_PERIODS as string[]).includes(rawPeriod ?? '')
    ? (rawPeriod as ScorePeriod)
    : '7d'

  // recent + prior 比較は急上昇用。同一期間で recent=今期、prior=前期。
  const periodHours: Record<ScorePeriod, number> = {
    '7d':   7  * 24,
    '30d':  30 * 24,
    '90d':  90 * 24,
    '180d': 180 * 24,
    '365d': 365 * 24,
    'all':  365 * 24 * 10,
  }
  const hrs = periodHours[period]

  // ── スコア集計 ───────────────────────────────────────────────────────────
  const [
    recentArticleScores,
    priorArticleScores,
    recentActressScores,
    priorActressScores,
  ] = await Promise.all([
    getAllArticleScores(period),
    // prior 期間: recent と同じ長さの 1期間前 — getAllArticleScores では期間=since。
    // 「from prior to recent開始」をシンプルに取るには直接 fetch しても良いが、
    // ここでは getAllArticleScores('all') を計算して prior = all - recent と近似する手段で代替する。
    getAllArticleScores('all').then(all => {
      const recent = new Map<string, number>()
      return new Promise<Map<string, number>>((resolve) => {
        // 注: 厳密な prior 集計のためには専用 fetch が必要。簡易実装で all - recent を採用。
        resolve(diffMap(all, recent))
      })
    }),
    getAllActressScores(period),
    getAllActressScores('all').then(all => {
      return new Promise<Map<string, number>>(resolve => {
        resolve(all)
      })
    }),
  ])

  // 厳密な prior を取り直す: all-期間 から recent を引く
  function diffMap(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
    const o = new Map<string, number>()
    for (const [k, v] of a) o.set(k, Math.max(0, v - (b.get(k) ?? 0)))
    return o
  }
  const articlePrior = diffMap(priorArticleScores, recentArticleScores)
  const actressPrior = diffMap(priorActressScores, recentActressScores)

  // ── 上位抽出 ─────────────────────────────────────────────────────────────
  const topArticleIds = [...recentArticleScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k)
  const topActressIds = [...recentActressScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k)

  const risingArticles = risingByRatio(recentArticleScores, articlePrior).slice(0, 8)
  const risingActresses = risingByRatio(recentActressScores, actressPrior).slice(0, 8)

  const allArticleIds = [...new Set([...topArticleIds, ...risingArticles.map(r => r.key)])]
  const allActressIds = [...new Set([...topActressIds, ...risingActresses.map(r => r.key)])]

  const [articles, actresses] = await Promise.all([
    fetchArticles(allArticleIds),
    fetchActresses(allActressIds),
  ])
  const articleMap = new Map(articles.map(a => [a.external_id, a]))
  const actressMap = new Map(actresses.map(a => [a.external_id, a]))

  // 順位付け
  const popularArticles = topArticleIds.map(id => articleMap.get(id)).filter((a): a is Article => !!a).slice(0, 10)
  const popularActresses = topActressIds.map(id => actressMap.get(id)).filter((a): a is Actress => !!a).slice(0, 10)
  const risingArticleCards = risingArticles
    .map(r => articleMap.get(r.key))
    .filter((a): a is Article => !!a)
    .slice(0, 8)
  const risingActressCards = risingActresses
    .map(r => actressMap.get(r.key))
    .filter((a): a is Actress => !!a)
    .slice(0, 8)

  const hasAnyData =
    popularArticles.length + popularActresses.length + risingArticleCards.length + risingActressCards.length > 0

  // 期間ラベル
  const periodLabel = PERIOD_LABEL[period]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-10">
      {/* パンくず */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">ライブランキング</span>
      </nav>

      {/* ヘッダー + 期間タブ */}
      <header className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--magenta)]/40 bg-[var(--magenta)]/12">
            <Trophy size={18} className="text-[var(--magenta)]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">ライブランキング</h1>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              FANZA遷移・視聴クリックの実ユーザー行動から算出。レビュー・星評価は不使用。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mr-1">期間</span>
          {SUPPORTED_PERIODS.map(p => {
            const active = p === period
            return (
              <Link
                key={p}
                href={p === '7d' ? '/verity/rankings' : `/verity/rankings?period=${p}`}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
                  active
                    ? 'bg-[var(--magenta)] text-white shadow-[0_0_14px_rgba(226,0,116,0.35)]'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]',
                ].join(' ')}
              >
                {PERIOD_LABEL[p]}
              </Link>
            )
          })}
        </div>
      </header>

      {/* セクション群 */}
      {!hasAnyData ? (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">この期間のデータがまだ揃っていません</p>
        </div>
      ) : (
        <div className="space-y-12">
          {popularArticles.length > 0 && (
            <Section
              icon={<TrendingUp size={13} className="text-amber-400" />}
              title={`${periodLabel} の人気作品`}
              accent="border-amber-500/40 bg-amber-500/10"
              sub="FANZA遷移と視聴クリックの合算スコア順"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {popularArticles.map((a, i) => (
                  <ArticleRankCard key={a.id} article={a} rank={i + 1} />
                ))}
              </div>
            </Section>
          )}

          {popularActresses.length > 0 && (
            <Section
              icon={<Crown size={13} className="text-[var(--magenta)]" />}
              title={`${periodLabel} の人気女優`}
              accent="border-[var(--magenta)]/40 bg-[var(--magenta)]/10"
              sub="女優プロフィール閲覧と関連作品クリックの合算"
            >
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
                {popularActresses.map((a, i) => (
                  <ActressRankCard key={a.id} actress={a} rank={i + 1} />
                ))}
              </div>
            </Section>
          )}

          {risingArticleCards.length > 0 && (
            <Section
              icon={<Flame size={13} className="text-emerald-400" />}
              title="急上昇作品"
              accent="border-emerald-500/40 bg-emerald-500/10"
              sub={`${periodLabel} のスコアが前期比で急増した作品`}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {risingArticleCards.map((a, i) => (
                  <ArticleRankCard key={a.id} article={a} rank={i + 1} badge="UP" />
                ))}
              </div>
            </Section>
          )}

          {risingActressCards.length > 0 && (
            <Section
              icon={<Flame size={13} className="text-emerald-400" />}
              title="急上昇女優"
              accent="border-emerald-500/40 bg-emerald-500/10"
              sub={`${periodLabel} のアクセスが急増した女優`}
            >
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
                {risingActressCards.map((a, i) => (
                  <ActressRankCard key={a.id} actress={a} rank={i + 1} badge="UP" />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      <p className="text-center text-[11px] text-[var(--text-muted)]">
        実ユーザー行動データを {hrs}h 範囲で集計。レビューや編集部採点は使用していません。
      </p>
    </div>
  )
}
