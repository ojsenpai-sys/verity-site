export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import {
  Sparkles,
  ExternalLink,
  ChevronRight,
  Star,
  Heart,
  BookOpen,
  Trophy,
  User,
  Compass,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { SpotlightLink } from '@/components/SpotlightLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { SpotlightViewTracker } from '@/components/SpotlightViewTracker'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
import { MENS_ESTHE_META } from '@/lib/mensEsthe'
import {
  SATSUKI_NAO_META,
  CHARM_AXES,
  SELECTED_WORKS,
  ALSO_NOTABLE,
  STARTER_PICKS,
  type CharmAxisKey,
} from '@/lib/satsukiNao'
import type { Article } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
// 公開URLはベアパス（proxy が /verity/ へリライト）。既存 Spotlight と同じSEOパターン。
const CANONICAL = `${BASE}${SATSUKI_NAO_META.publicUrl}`
const SLUG = SATSUKI_NAO_META.slug
const ACTRESS_HREF = `/verity/actresses/${SATSUKI_NAO_META.actressExternalId}`

// ── データ取得 ────────────────────────────────────────────────────────────────

/** CID 配列で記事を取得し、渡された順序を保持して返す（存在しない CID は除外） */
async function getArticlesByCids(cids: string[]): Promise<Article[]> {
  if (cids.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, slug, tags, summary, image_url, published_at, metadata')
    .eq('is_active', true)
    .in('external_id', cids)
  if (error) console.error('[spotlight/satsuki-nao] articles:', error.message)
  const map = new Map(((data as Article[]) ?? []).map((a) => [a.external_id, a]))
  return cids.map((c) => map.get(c)).filter(Boolean) as Article[]
}

type ActressRow = { external_id: string; name: string; ruby: string | null; image_url: string | null }

async function getActress(): Promise<ActressRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('external_id, name, ruby, image_url')
    .eq('external_id', SATSUKI_NAO_META.actressExternalId)
    .limit(1)
    .maybeSingle()
  return (data as ActressRow | null) ?? null
}

/**
 * 週間ランキングで獲得した最上位の実績を1件返す。
 * 「常に1位」と誤認させないため、順位と対象週をセットで表示する用途に使う。
 * 該当がなければ null（バッジ自体を出さない）。
 */
type RankingAchievement = { rank: number; weekKey: string; uniqueSessions: number }

async function getBestActressRanking(): Promise<RankingAchievement | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('weekly_rankings')
    .select('rank, week_key, unique_sessions')
    .eq('ranking_type', 'actress')
    .eq('entity_id', SATSUKI_NAO_META.actressExternalId)
    .order('rank', { ascending: true })
    .order('week_key', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) console.error('[spotlight/satsuki-nao] weekly_rankings:', error.message)
  if (!data) return null
  return {
    rank: data.rank as number,
    weekKey: data.week_key as string,
    uniqueSessions: data.unique_sessions as number,
  }
}

/**
 * 出演作品数を DB から実測する。
 * 版違い（DVD版・FANZA限定版 tk*）を含めると実態より膨らむため、
 * 動画配信版の品番形式（英字＋5桁ゼロ埋め）のみを数える。
 */
const DIGITAL_CID = /^\d*[a-z_]+\d{5}[a-z]*$/

async function getWorkStats(): Promise<{ digitalCount: number; makerCount: number } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('external_id, metadata')
    .eq('is_active', true)
    .contains('tags', [SATSUKI_NAO_META.actressTag])
  if (error || !data) {
    console.error('[spotlight/satsuki-nao] stats:', error?.message)
    return null
  }
  const digital = (data as Article[]).filter(
    (a) => DIGITAL_CID.test(a.external_id) && !a.external_id.startsWith('tk'),
  )
  const makers = new Set(digital.map((a) => makerName(a)).filter(Boolean) as string[])
  return { digitalCount: digital.length, makerCount: makers.size }
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

function proxiedJacket(article: Article): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  const cid = article.external_id
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

function affiliateUrl(article: Article, isOverseas: boolean): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? (article.metadata.affiliate_url as string)
      : typeof article.metadata?.url === 'string'
      ? (article.metadata.url as string)
      : null
  return withAffiliateForRegion(raw, isOverseas)
}

type NamedRef = { id?: number; name?: string }

function makerName(article: Article): string | null {
  const list = article.metadata?.maker
  if (Array.isArray(list)) return (list as NamedRef[])[0]?.name ?? null
  if (typeof list === 'string') return list
  return null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** week_key（集計週の月曜 YYYY-MM-DD）を「2026年7月6日週」表記へ */
function fmtWeek(weekKey: string): string {
  const [y, m, d] = weekKey.split('-').map(Number)
  return `${y}年${m}月${d}日週`
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata() {
  const hero = (await getArticlesByCids([SATSUKI_NAO_META.heroCid]))[0] ?? null
  const heroImg = hero ? proxiedJacket(hero) : null
  const ogImage = heroImg ? `${BASE}${heroImg}` : undefined

  const title = SATSUKI_NAO_META.seoTitle
  const description = SATSUKI_NAO_META.seoDescription

  return {
    title,
    description,
    alternates: { canonical: CANONICAL },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: 'article',
      url: CANONICAL,
      publishedTime: SATSUKI_NAO_META.publishedAt,
      ...(ogImage ? { images: [{ url: ogImage, width: 800, height: 538, alt: title }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

/**
 * 構造化データ（Article + BreadcrumbList + ItemList）。
 * metadata の other['script:ld+json'] はこの Next バージョンでは <meta> として
 * 出力され構造化データとして機能しないため、ボディにインライン <script> で注入する
 * （既存 Spotlight・記事詳細ページと同じ確実な方式）。
 *
 * ※ 評価・順位などの検証できない主張は載せない。掲載しているのは
 *    ページ自身のメタ情報と、DB から取得した作品名／URL のみ。
 */
function buildJsonLd(ogImage: string | null, works: { article: Article }[]): string {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: SATSUKI_NAO_META.seoTitle,
      description: SATSUKI_NAO_META.seoDescription,
      datePublished: SATSUKI_NAO_META.publishedAt,
      dateModified: SATSUKI_NAO_META.publishedAt,
      ...(ogImage ? { image: ogImage } : {}),
      author: { '@type': 'Organization', name: 'VERITY 編集部' },
      publisher: { '@type': 'Organization', name: 'VERITY' },
      mainEntityOfPage: CANONICAL,
      about: { '@type': 'Person', name: SATSUKI_NAO_META.actressName },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'VERITY', item: `${BASE}/verity` },
        { '@type': 'ListItem', position: 2, name: 'Spotlight', item: `${BASE}/verity/features` },
        { '@type': 'ListItem', position: 3, name: SATSUKI_NAO_META.title, item: CANONICAL },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `VERITY編集部 厳選 ${SATSUKI_NAO_META.actressName} ${works.length}作品`,
      numberOfItems: works.length,
      itemListElement: works.map((w, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: w.article.title,
        ...(w.article.slug ? { url: `${BASE}/articles/${w.article.slug}` } : {}),
      })),
    },
  ])
}

// ── 小コンポーネント ──────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-6 w-1 shrink-0 rounded-full"
        style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.15))' }}
      />
      <h2 className="text-lg font-bold text-[#d4af37] sm:text-xl">{label}</h2>
      {count !== undefined && (
        <span className="shrink-0 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#d4af37]">
          {count}件
        </span>
      )}
    </div>
  )
}

function ProseBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-[#d4af37]/15 bg-black/30 p-6 backdrop-blur-sm sm:p-8">
      <div
        className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl"
        style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.08))' }}
      />
      <div className="space-y-4 text-[13px] leading-loose text-white/65 sm:text-[14px]">{children}</div>
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d4af37]/20 bg-black/35 px-4 py-3 text-center">
      <p className="text-lg font-black text-[#d4af37] sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-white/45">{label}</p>
    </div>
  )
}

// ── 作品カード ────────────────────────────────────────────────────────────────

function WorkCard({
  article,
  fanzaUrl,
  axisBadge,
  reason,
  index,
}: {
  article: Article
  fanzaUrl: string | null
  axisBadge: string
  reason: string
  /** 厳選10作品を通した 1 始まりの並び順 */
  index: number
}) {
  const imgSrc = proxiedJacket(article)
  const maker = makerName(article)

  // 既存 fanza_click に付与する計測メタ。position（UI導線文字列）は既存集計と互換の
  // ため温存し、並び順は予約キー position を汚さないよう spotlight_position に格納する。
  const clickMeta: Record<string, unknown> = {
    source: 'spotlight',
    spotlight_slug: SLUG,
    spotlight_section: axisBadge,
    spotlight_position: index,
    article_slug: article.slug,
    work_title: article.title,
    actress_name: SATSUKI_NAO_META.actressName,
    ...(maker ? { maker_name: maker } : {}),
  }

  const cover = (
    <>
      <ProxiedImage
        src={imgSrc!}
        alt={`${article.title}（${SATSUKI_NAO_META.actressName}）のパッケージ画像`}
        loading="lazy"
        className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(article.image_url)} transition-transform duration-300 group-hover:scale-105`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/50 md:flex">
        <span className="translate-y-1 scale-95 rounded-full bg-[#d4af37]/90 px-3 py-1 text-[10px] font-bold text-[#0a0800] opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
          ▶ FANZAで観る
        </span>
      </div>
    </>
  )

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[#d4af37]/20 bg-black/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-[0_0_28px_rgba(212,175,55,0.18)]">
      {/* 表紙（クリックで FANZA・fanza_click を1回だけ発火。アンカーのネストは避ける） */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#0d0a00]">
        {!imgSrc ? (
          <NowPrinting />
        ) : fanzaUrl ? (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position="spotlight_satsuki_nao_image"
            meta={clickMeta}
            ariaLabel={`${article.title}をFANZAで観る`}
            className="absolute inset-0 block h-full w-full"
          >
            {cover}
          </FanzaLink>
        ) : (
          cover
        )}

        {/* 通し番号 + 魅力軸バッジ */}
        <span className="absolute left-2 top-2 rounded-full bg-[#0a0800]/85 px-2 py-0.5 text-[10px] font-black text-[#d4af37] backdrop-blur-sm">
          {String(index).padStart(2, '0')}
        </span>
        <span className="absolute right-2 top-2 max-w-[70%] truncate rounded-full border border-[#d4af37]/45 bg-[#0a0800]/85 px-2 py-0.5 text-[9px] font-bold text-[#d4af37] backdrop-blur-sm">
          {axisBadge}
        </span>
      </div>

      {/* 本文 */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* タイトル（記事ページへ。遷移先で video_view が記録される） */}
        {article.slug ? (
          <SpotlightLink
            href={`/verity/articles/${article.slug}`}
            slug={SLUG}
            placement="page_work_detail"
            destination={article.external_id}
          >
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85 transition-colors group-hover:text-[#d4af37]/90">
              {article.title}
            </p>
          </SpotlightLink>
        ) : (
          <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85">{article.title}</p>
        )}

        {/* メーカー・発売日 */}
        <div className="space-y-0.5">
          {maker && <p className="line-clamp-1 text-[9px] text-white/40">{maker}</p>}
          {article.published_at && (
            <p className="text-[9px] text-[#d4af37]/50">{fmtDate(article.published_at)}</p>
          )}
        </div>

        {/* VERITY編集部の選定理由 */}
        <p className="mt-1 border-t border-[#d4af37]/12 pt-2 text-[10.5px] leading-relaxed text-white/55">
          {reason}
        </p>

        {/* CTA */}
        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          {fanzaUrl && (
            <FanzaLink
              href={fanzaUrl}
              targetId={article.external_id}
              position="spotlight_satsuki_nao"
              meta={clickMeta}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#b8960c] to-[#d4af37] py-2 text-[10px] font-bold text-[#0a0800] transition-all hover:brightness-110"
            >
              FANZAで観る
              <ExternalLink size={9} />
            </FanzaLink>
          )}
          {article.slug && (
            <SpotlightLink
              href={`/verity/articles/${article.slug}`}
              slug={SLUG}
              placement="page_work_detail"
              destination={article.external_id}
              className="flex items-center justify-center gap-1 rounded-lg border border-[#d4af37]/25 py-1.5 text-[10px] font-bold text-[#d4af37]/70 transition-colors hover:border-[#d4af37]/50 hover:text-[#d4af37]"
            >
              作品詳細へ
              <ChevronRight size={10} />
            </SpotlightLink>
          )}
        </div>
      </div>
    </article>
  )
}

function RelatedLink({
  href,
  label,
  sub,
  placement,
}: {
  href: string
  label: string
  sub: string
  placement: string
}) {
  return (
    <SpotlightLink
      href={href}
      slug={SLUG}
      placement={placement}
      className="group flex items-center justify-between rounded-xl border border-[#d4af37]/15 bg-black/30 p-4 transition-all hover:border-[#d4af37]/40 hover:bg-[#d4af37]/5"
    >
      <div>
        <p className="text-[12px] font-bold text-white/70 transition-colors group-hover:text-[#d4af37]">{label}</p>
        <p className="text-[10px] text-[#d4af37]/40">{sub}</p>
      </div>
      <ChevronRight size={14} className="shrink-0 text-[#d4af37]/30 transition-colors group-hover:text-[#d4af37]/70" />
    </SpotlightLink>
  )
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function SatsukiNaoSpotlightPage() {
  const selectedCids = SELECTED_WORKS.map((w) => w.cid)
  const notableCids = ALSO_NOTABLE.map((w) => w.cid)

  const [selectedArticles, notableArticles, actress, ranking, stats, isOverseas] = await Promise.all([
    getArticlesByCids(selectedCids),
    getArticlesByCids(notableCids),
    getActress(),
    getBestActressRanking(),
    getWorkStats(),
    getIsOverseasUser(),
  ])

  // CID → 記事。DB に無い CID はカードごと出さない（欠損表示を作らない）
  const articleByCid = new Map(selectedArticles.map((a) => [a.external_id, a]))
  const works = SELECTED_WORKS.map((w) => {
    const article = articleByCid.get(w.cid)
    return article ? { ...w, article } : null
  }).filter(Boolean) as { cid: string; axis: CharmAxisKey; reason: string; article: Article }[]

  // 通し番号は「掲載される作品」に対して 1 から振る
  const orderByCid = new Map(works.map((w, i) => [w.cid, i + 1]))

  const notableByCid = new Map(notableArticles.map((a) => [a.external_id, a]))
  const notables = ALSO_NOTABLE.map((n) => {
    const article = notableByCid.get(n.cid)
    return article ? { ...n, article } : null
  }).filter(Boolean) as { cid: string; note: string; article: Article }[]

  const starters = STARTER_PICKS.map((p) => {
    const article = articleByCid.get(p.cid)
    return article ? { ...p, article } : null
  }).filter(Boolean) as { cid: string; label: string; article: Article }[]

  // ヒーロー画像 — 女優レコードの正規画像を優先し、無ければ代表作のジャケットへ
  const heroArticle = articleByCid.get(SATSUKI_NAO_META.heroCid) ?? works[0]?.article ?? null
  const heroImg =
    actress?.image_url && !isBadImageUrl(actress.image_url)
      ? `/verity/api/proxy/image?url=${encodeURIComponent(
          toHighResPackageUrl(actress.image_url) ?? actress.image_url,
        )}`
      : heroArticle
      ? proxiedJacket(heroArticle)
      : null
  const heroImgPos = coverPosClass(actress?.image_url ?? heroArticle?.image_url)
  const ogImageAbs = heroArticle ? `${BASE}${proxiedJacket(heroArticle)}` : null

  return (
    <div className="min-h-screen bg-[#0a0800]">
      {/* 表示計測 — spotlight_view を1表示1回だけ送信（既存の汎用トラッカー） */}
      <SpotlightViewTracker
        slug={SLUG}
        title={SATSUKI_NAO_META.title}
        workCount={works.length}
        normalWorkCount={works.length}
        vrWorkCount={0}
      />

      {/* 構造化データ（Article + BreadcrumbList + ItemList） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildJsonLd(ogImageAbs, works) }}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          ① ヒーロー
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative flex min-h-[440px] items-end overflow-hidden border-b border-[#d4af37]/20 sm:min-h-[520px]">
        {/* 右側 ambient 背景（人物が切れないよう object-position はDMM規約に従う） */}
        {heroImg && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden sm:block">
            <ProxiedImage
              src={heroImg}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover ${heroImgPos} opacity-[0.24]`}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to right, #0a0800 0%, rgba(10,8,0,0.6) 30%, rgba(10,8,0,0.1) 72%, transparent 100%)',
              }}
            />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, #0a0800 25%, rgba(10,8,0,0.72) 58%, rgba(10,8,0,0.35) 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{ background: 'radial-gradient(ellipse 70% 55% at 28% 55%, rgba(212,175,55,0.13) 0%, transparent 70%)' }}
        />

        <div className="relative mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
          <div className="space-y-5">
            {/* パンくず */}
            <nav aria-label="パンくずリスト" className="flex flex-wrap items-center gap-1 text-[10px] text-[#d4af37]/40">
              <Link href="/verity" className="transition-colors hover:text-[#d4af37]/70">
                VERITY
              </Link>
              <ChevronRight size={10} />
              <Link href="/verity/features" className="transition-colors hover:text-[#d4af37]/70">
                Spotlight
              </Link>
              <ChevronRight size={10} />
              <span className="text-[#d4af37]/60">{SATSUKI_NAO_META.title}</span>
            </nav>

            {/* シリーズラベル + ランキング実績バッジ */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
                <Sparkles size={10} />
                {SATSUKI_NAO_META.seriesLabel}
              </span>
              {ranking && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/50 bg-[#d4af37]/15 px-3 py-1 text-[10px] font-bold text-[#d4af37]">
                  <Trophy size={11} />
                  VERITY週間女優ランキング {fmtWeek(ranking.weekKey)} {ranking.rank}位
                </span>
              )}
            </div>

            {/* タイトル（H1 は 1 つ） */}
            <h1
              className="text-[26px] font-black leading-tight tracking-tight text-[#d4af37] sm:text-5xl"
              style={{ textShadow: '0 0 56px rgba(212,175,55,0.5)' }}
            >
              {SATSUKI_NAO_META.h1}
            </h1>

            {/* サブコピー */}
            <p className="max-w-2xl text-[13px] font-bold leading-relaxed text-white/70 sm:text-base">
              {SATSUKI_NAO_META.subCopy}
            </p>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <a
                href="#verity-selection"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#b8960c] to-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#0a0800] transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(212,175,55,0.5)]"
              >
                <Star size={14} />
                厳選作品を見る
              </a>
              <SpotlightLink
                href={ACTRESS_HREF}
                slug={SLUG}
                placement="page_actress"
                destination={SATSUKI_NAO_META.actressExternalId}
                className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/8 px-5 py-2.5 text-sm font-bold text-[#d4af37] transition-all hover:border-[#d4af37]/70 hover:bg-[#d4af37]/16"
              >
                <User size={14} />
                {SATSUKI_NAO_META.actressName}の女優ページ
              </SpotlightLink>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          メインコンテンツ
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-5xl space-y-16 px-4 py-14">
        {/* ② なぜ今、彩月七緒なのか */}
        <section className="space-y-6">
          <SectionHeader label="なぜ今、彩月七緒なのか" />

          {/* 実測スタット（すべて DB 実データ） */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ranking && <StatChip label={`週間女優ランキング（${fmtWeek(ranking.weekKey)}）`} value={`${ranking.rank}位`} />}
            {stats && <StatChip label="VERITY掲載の出演作（動画配信版）" value={`${stats.digitalCount}作品`} />}
            {stats && <StatChip label="出演メーカー数" value={`${stats.makerCount}社`} />}
            <StatChip label="本特集の厳選作品" value={`${works.length}作品`} />
          </div>

          <ProseBlock>
            {ranking && (
              <p>
                VERITYが毎週日曜に発表している週間女優ランキングで、彩月七緒は
                <strong className="font-bold text-white/85">
                  {fmtWeek(ranking.weekKey)}に{ranking.rank}位を獲得
                </strong>
                しました。同じ週の「急上昇女優」ランキングでも首位に立っており、閲覧の伸びが一時的な瞬間風速ではなく、
                実際の関心の広がりとして表れた形です。
              </p>
            )}
            <p>
              彼女のキャリアを追うと、その伸びの理由が見えてきます。専属としての活動を経たのち、現在は
              <strong className="font-bold text-white/85">複数のメーカーを横断する企画単体女優</strong>
              として出演を重ねている——VERITYに登録されている出演作を見ても、その顔ぶれは一社に偏っていません。
              職業ものの落ち着いた設定から、原作コラボ、美少女ブランドの制服ものまで、任される役柄の幅は明らかに広い。
            </p>
            <p>
              話題性だけで説明できる状況ではない、というのが編集部の見立てです。一発の企画が当たった女優なら、
              数字は上がってもすぐ落ちる。彼女の場合は出演本数と支持が並行して増えており、
              しかも起用するメーカーの側が増え続けている。これは
              <strong className="font-bold text-white/85">「また使いたい」と思わせる何かが現場にある</strong>
              ことを意味します。
            </p>
            <p>
              では、その「何か」とは具体的に何なのか。本特集では、豊満なスタイル・包み込むような雰囲気・
              幅広い企画への対応力・演技と表情という4つの軸から、彼女がいま支持されている理由を読み解いていきます。
              ひとつの武器で勝っている女優ではない、というのが結論の先取りです。
            </p>
          </ProseBlock>

          {stats && (
            <p className="text-[10px] leading-relaxed text-white/25">
              ※ 出演作数・メーカー数はVERITYデータベースの実測値です。集計基準：articles のタグに「
              {SATSUKI_NAO_META.actressTag}」を含む公開中のレコードのうち、動画配信版の品番のみ（同一作品のDVD版・
              FANZA限定版などの版違いは除外）。数値はページ表示時点のものです。
              週間ランキングは集計週ごとのスナップショットで、常時この順位であることを示すものではありません。
            </p>
          )}
        </section>

        {/* ③④ 4つの魅力 × VERITY編集部 厳選作品 */}
        <section id="verity-selection" className="space-y-10">
          <div className="space-y-3">
            <SectionHeader label="VERITY編集部 厳選作品 — 4つの魅力で読み解く" count={works.length} />
            <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
              4つの魅力それぞれに代表作を割り当てました。1作品につき軸はひとつだけとし、同じ作品を重ねて掲載していません。
              メーカーや作品傾向が偏らないよう、発売日順・人気順のどちらでもない編集部の視点で選定しています。
            </p>
          </div>

          {CHARM_AXES.map((axis) => {
            const axisWorks = works.filter((w) => w.axis === axis.key)
            if (axisWorks.length === 0) return null
            return (
              <div key={axis.key} className="space-y-5">
                {/* 軸の見出し + 解説 */}
                <div className="space-y-3 rounded-2xl border border-[#d4af37]/15 bg-black/25 p-5 backdrop-blur-sm sm:p-7">
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-2xl leading-none">{axis.emoji}</span>
                    <h3 className="text-[15px] font-bold leading-snug text-[#d4af37] sm:text-lg">{axis.label}</h3>
                  </div>
                  <div className="space-y-3 text-[12.5px] leading-loose text-white/60 sm:text-[13.5px]">
                    {axis.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>

                {/* 該当作品 */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {axisWorks.map((w) => (
                    <WorkCard
                      key={w.article.id}
                      article={w.article}
                      fanzaUrl={affiliateUrl(w.article, isOverseas)}
                      axisBadge={axis.badge}
                      reason={w.reason}
                      index={orderByCid.get(w.cid) ?? 0}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          <p className="text-center text-[10px] text-white/25">※ 18歳以上を対象としたアダルトコンテンツです</p>
        </section>

        {/* ⑤ 初めて見る人へのおすすめ導線（小型リンク・カード再描画はしない） */}
        {starters.length > 0 && (
          <section className="space-y-6">
            <SectionHeader label="初めて観るなら、どれから？" />
            <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
              上で紹介した厳選作品から、目的別の入口をまとめました。気になる方向から一本選んでみてください。
            </p>
            <div className="overflow-hidden rounded-2xl border border-[#d4af37]/15 bg-black/25">
              {starters.map((s, i) => (
                <SpotlightLink
                  key={s.cid}
                  href={`/verity/articles/${s.article.slug}`}
                  slug={SLUG}
                  placement="page_work_detail"
                  destination={s.article.external_id}
                  className={`group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#d4af37]/6 sm:px-5 ${
                    i > 0 ? 'border-t border-[#d4af37]/10' : ''
                  }`}
                >
                  <Compass size={14} className="shrink-0 text-[#d4af37]/55" />
                  <span className="shrink-0 text-[11px] font-bold text-[#d4af37]/85 sm:text-[12px]">{s.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-white/50 transition-colors group-hover:text-white/75">
                    {s.article.title}
                  </span>
                  <ChevronRight size={13} className="shrink-0 text-[#d4af37]/30 transition-colors group-hover:text-[#d4af37]/70" />
                </SpotlightLink>
              ))}
            </div>
          </section>
        )}

        {/* ⑥ こちらも注目（選外作品・厳選10とは明確に区別する） */}
        {notables.length > 0 && (
          <section className="space-y-6">
            <SectionHeader label="こちらも注目" />
            <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
              厳選作品には入らなかったものの、彼女を知るうえで押さえておきたい作品です。
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {notables.map((n) => {
                const img = proxiedJacket(n.article)
                const maker = makerName(n.article)
                return (
                  <SpotlightLink
                    key={n.cid}
                    href={`/verity/articles/${n.article.slug}`}
                    slug={SLUG}
                    placement="page_work_detail"
                    destination={n.article.external_id}
                    className="group flex gap-3 rounded-xl border border-[#d4af37]/12 bg-black/25 p-3 transition-all hover:border-[#d4af37]/35 hover:bg-[#d4af37]/5"
                  >
                    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-[#0d0a00]">
                      {img ? (
                        <ProxiedImage
                          src={img}
                          alt={`${n.article.title}のパッケージ画像`}
                          loading="lazy"
                          className={`h-full w-full object-cover ${coverPosClass(n.article.image_url)}`}
                        />
                      ) : (
                        <NowPrinting />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="line-clamp-2 text-[10.5px] font-medium leading-snug text-white/75 transition-colors group-hover:text-[#d4af37]/90">
                        {n.article.title}
                      </p>
                      {maker && <p className="truncate text-[9px] text-white/35">{maker}</p>}
                      <p className="text-[10px] leading-relaxed text-white/45">{n.note}</p>
                    </div>
                  </SpotlightLink>
                )
              })}
            </div>
          </section>
        )}

        {/* ⑦ 総括 */}
        <section className="space-y-6">
          <SectionHeader label="編集部より — 重なりが生む存在感" />
          <div className="relative rounded-2xl border border-[#d4af37]/20 bg-black/35 p-6 backdrop-blur-sm sm:p-8">
            <BookOpen size={20} className="mb-4 text-[#d4af37]/60" />
            <div className="space-y-4 text-[13px] leading-loose text-white/65 sm:text-[14px]">
              <p>
                ここまで4つの軸で見てきましたが、彩月七緒の魅力は
                <strong className="font-bold text-white/85">どれかひとつを取り出しても説明がつかない</strong>
                、というのが率直な感想です。スタイルだけの女優なら他にもいる。優しい雰囲気だけでも、演技だけでも同じことです。
              </p>
              <p>
                彼女の場合は、その全部が同時に成立している。だから制服を着ても、施術着を着ても、生活感のある部屋にいても、
                そこに立っているのが彼女であるというだけで画が持つ。複数のメーカーが繰り返し起用する理由は、
                結局のところこの「どこに置いても成立する」という一点に集約されるのだと思います。
              </p>
              <p>
                そして出演作が増えるほど、まだ見ていなかった表情が出てくる。今回選んだ作品も、
                半年後には「あの頃はまだ入口だった」と言われているかもしれません。VERITYでは引き続き、
                彼女の新作と評価の動きを追いかけていきます。
              </p>
              <p className="text-right text-[12px] italic text-white/40">— VERITY 編集部</p>
            </div>
          </div>
        </section>

        {/* ⑧ 関連導線 */}
        <section className="space-y-8">
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.3), transparent)' }}
          />
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-[#d4af37]/40">Related</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <RelatedLink
              href={ACTRESS_HREF}
              label={`${SATSUKI_NAO_META.actressName}の女優ページ`}
              sub="プロフィールと最新出演作"
              placement="page_actress"
            />
            <RelatedLink
              href="/verity/ranking"
              label="週間女優ランキング"
              sub="毎週日曜23:30発表"
              placement="page_ranking"
            />
            <RelatedLink
              href={MENS_ESTHE_META.href}
              label={MENS_ESTHE_META.title}
              sub="関連Spotlight特集"
              placement="page_related_spotlight"
            />
            <RelatedLink href="/verity/features" label="特集一覧" sub="VERITY Spotlight" placement="page_related_spotlight" />
          </div>

          {/* FANZA導線（既存 affiliate / 計測を維持） */}
          {heroArticle && affiliateUrl(heroArticle, isOverseas) && (
            <div className="text-center">
              <FanzaLink
                href={affiliateUrl(heroArticle, isOverseas)!}
                targetId={heroArticle.external_id}
                position="spotlight_satsuki_nao_footer"
                meta={{
                  source: 'spotlight',
                  spotlight_slug: SLUG,
                  spotlight_section: 'footer_cta',
                  actress_name: SATSUKI_NAO_META.actressName,
                  work_title: heroArticle.title,
                }}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#b8960c] to-[#d4af37] px-6 py-3 text-sm font-bold text-[#0a0800] transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(212,175,55,0.45)]"
              >
                FANZAで{SATSUKI_NAO_META.actressName}の作品を見る
                <ExternalLink size={13} />
              </FanzaLink>
            </div>
          )}
        </section>

        {/* PR 表示 */}
        <div className="space-y-3 text-center">
          <p className="text-[10px] text-white/20">
            <span className="mr-1.5 rounded border border-[#d4af37]/20 bg-[#d4af37]/8 px-1.5 py-0.5 text-[9px] font-bold text-[#d4af37]/40">
              PR
            </span>
            FANZAへのリンクはアフィリエイトリンクです
          </p>
          <Link
            href="/verity"
            className="inline-flex items-center gap-1 text-sm text-white/30 transition-colors hover:text-[#d4af37]/60"
          >
            <Heart size={12} />
            VERITYトップへ戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
