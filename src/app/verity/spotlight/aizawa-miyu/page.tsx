export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { Sparkles, ExternalLink, ChevronRight, Heart, User, Compass, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { SpotlightLink } from '@/components/SpotlightLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { SpotlightViewTracker } from '@/components/SpotlightViewTracker'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
import { getArticlesByCids, pickAvailableNow, isVrWork, getReservationStatus } from '@/lib/spotlightV2'
import { getActressCatalogPage } from '@/lib/actressSpotlightCatalog'
import {
  AIZAWA_MIYU_META,
  CATEGORIES,
  CATEGORY_WORKS,
  EDITORS_PICK,
  VERITY_PICKS,
  NOW_CONFIG,
  type CategoryKey,
} from '@/lib/aizawaMiyu'
import { WorkCard, fmtDate, affiliateUrl, type WorkCardArticle } from './WorkCard'
import { MoreMiyuCatalog } from './MoreMiyuCatalog'
import type { Article } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
const CANONICAL = `${BASE}${AIZAWA_MIYU_META.publicUrl}`
const SLUG = AIZAWA_MIYU_META.slug
const ACTRESS_HREF = `/verity/actresses/${AIZAWA_MIYU_META.actressExternalId}`
const MORE_MIYU_INITIAL = 48

type ActressRow = { external_id: string; name: string; ruby: string | null; image_url: string | null }

async function getActress(): Promise<ActressRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('external_id, name, ruby, image_url')
    .eq('external_id', AIZAWA_MIYU_META.actressExternalId)
    .limit(1)
    .maybeSingle()
  return (data as ActressRow | null) ?? null
}

function proxiedJacket(article: WorkCardArticle): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  if (article.external_id) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
  return null
}

export async function generateMetadata() {
  const [nowArticle] = await getArticlesByCids([NOW_CONFIG.comingNextCid])
  const heroImg = nowArticle ? proxiedJacket(nowArticle) : null
  const ogImage = heroImg ? `${BASE}${heroImg}` : undefined

  const title = AIZAWA_MIYU_META.seoTitle
  const description = AIZAWA_MIYU_META.seoDescription

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
      publishedTime: AIZAWA_MIYU_META.publishedAt,
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

function buildJsonLd(ogImage: string | null, works: { article: Article }[]): string {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: AIZAWA_MIYU_META.seoTitle,
      description: AIZAWA_MIYU_META.seoDescription,
      datePublished: AIZAWA_MIYU_META.publishedAt,
      dateModified: AIZAWA_MIYU_META.publishedAt,
      ...(ogImage ? { image: ogImage } : {}),
      author: { '@type': 'Organization', name: 'VERITY 編集部' },
      publisher: { '@type': 'Organization', name: 'VERITY' },
      mainEntityOfPage: CANONICAL,
      about: { '@type': 'Person', name: AIZAWA_MIYU_META.actressName },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'VERITY', item: `${BASE}/verity` },
        { '@type': 'ListItem', position: 2, name: 'Spotlight', item: `${BASE}/verity/features` },
        { '@type': 'ListItem', position: 3, name: AIZAWA_MIYU_META.title, item: CANONICAL },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `VERITY編集部 厳選 ${AIZAWA_MIYU_META.actressName} ${works.length}作品`,
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

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-6 w-1 shrink-0 rounded-full bg-gradient-to-b from-fuchsia-500 to-fuchsia-500/10" />
      <h2 className="text-lg font-bold text-fuchsia-300 sm:text-xl">{label}</h2>
      {count !== undefined && (
        <span className="shrink-0 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] font-bold text-fuchsia-300">
          {count}件
        </span>
      )}
    </div>
  )
}

function ProseBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-white/10 bg-black/30 p-6 backdrop-blur-sm sm:p-8">
      <div className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl bg-gradient-to-b from-fuchsia-500 to-fuchsia-500/5" />
      <div className="space-y-4 text-[13px] leading-loose text-white/65 sm:text-[14px]">{children}</div>
    </div>
  )
}

export default async function AizawaMiyuSpotlightPage() {
  const fixedCids = [
    NOW_CONFIG.comingNextCid,
    ...NOW_CONFIG.availableNowCandidates,
    ...CATEGORY_WORKS.map((w) => w.cid),
  ]
  const uniqueFixedCids = [...new Set(fixedCids)]

  const [fixedArticles, actress, isOverseas, catalogPage] = await Promise.all([
    getArticlesByCids(uniqueFixedCids),
    getActress(),
    getIsOverseasUser(),
    getActressCatalogPage({ actressTag: AIZAWA_MIYU_META.actressTag, filter: 'all', offset: 0, limit: MORE_MIYU_INITIAL }),
  ])

  const articleByCid = new Map(fixedArticles.map((a) => [a.external_id, a]))

  // ── NOW: COMING NEXT / AVAILABLE NOW ────────────────────────────────────────
  const comingNextArticle = articleByCid.get(NOW_CONFIG.comingNextCid) ?? null
  const availableNowCandidateArticles = NOW_CONFIG.availableNowCandidates
    .map((cid) => articleByCid.get(cid))
    .filter(Boolean) as Article[]
  const availableNowArticle = pickAvailableNow(availableNowCandidateArticles)
  const comingNextReservation = comingNextArticle ? getReservationStatus(comingNextArticle.published_at) : null

  // ── カテゴリ別 固定作品（DBに存在するCIDのみ・存在しないものは欠損表示しない） ──────
  const worksByCategory = new Map<CategoryKey, { article: Article; reason: string }[]>()
  for (const w of CATEGORY_WORKS) {
    const article = articleByCid.get(w.cid)
    if (!article) continue
    const list = worksByCategory.get(w.category) ?? []
    list.push({ article, reason: w.reason })
    worksByCategory.set(w.category, list)
  }
  const totalFixedWorkCount =
    (comingNextArticle ? 1 : 0) + (availableNowArticle ? 1 : 0) + [...worksByCategory.values()].reduce((s, l) => s + l.length, 0)

  // ── VERITY PICKS: 固定CID or NOW側で解決したCIDを差し込む ──────────────────────
  const verityPicksResolved = VERITY_PICKS.map((axis) => {
    const cid = axis.cid === 'AVAILABLE_NOW' ? availableNowArticle?.external_id : axis.cid === 'NOW_CID' ? NOW_CONFIG.comingNextCid : axis.cid
    const article = cid ? articleByCid.get(cid) : undefined
    return article ? { axis, article } : null
  }).filter(Boolean) as { axis: (typeof VERITY_PICKS)[number]; article: Article }[]

  // ── ヒーロー画像 ──────────────────────────────────────────────────────────────
  const heroArticle = comingNextArticle ?? fixedArticles[0] ?? null
  const heroImg =
    actress?.image_url && !isBadImageUrl(actress.image_url)
      ? `/verity/api/proxy/image?url=${encodeURIComponent(toHighResPackageUrl(actress.image_url) ?? actress.image_url)}`
      : heroArticle
      ? proxiedJacket(heroArticle)
      : null
  const heroImgPos = coverPosClass(actress?.image_url ?? heroArticle?.image_url)
  const ogImageAbs = heroArticle ? `${BASE}${proxiedJacket(heroArticle)}` : null

  const jsonLdWorks = [
    ...(comingNextArticle ? [{ article: comingNextArticle }] : []),
    ...(availableNowArticle ? [{ article: availableNowArticle }] : []),
    ...[...worksByCategory.values()].flat(),
  ]

  return (
    <div className="min-h-screen bg-[#08080b]">
      <SpotlightViewTracker
        slug={SLUG}
        title={AIZAWA_MIYU_META.title}
        workCount={totalFixedWorkCount}
        normalWorkCount={totalFixedWorkCount}
        vrWorkCount={jsonLdWorks.filter(({ article }) => isVrWork(article)).length}
      />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: buildJsonLd(ogImageAbs, jsonLdWorks) }} />

      {/* ══════════════════════════════════════════════════════════════════════
          ① FIRST VIEW（dark editorial）
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative flex min-h-[460px] items-end overflow-hidden border-b border-white/10 sm:min-h-[560px]">
        {heroImg && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden sm:block">
            <ProxiedImage src={heroImg} alt="" className={`absolute inset-0 h-full w-full object-cover ${heroImgPos} opacity-[0.28] grayscale`} />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to right, #08080b 0%, rgba(8,8,11,0.65) 30%, rgba(8,8,11,0.15) 72%, transparent 100%)' }}
            />
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #08080b 25%, rgba(8,8,11,0.75) 58%, rgba(8,8,11,0.4) 100%)' }} />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{ background: 'radial-gradient(ellipse 70% 55% at 28% 55%, rgba(217,70,239,0.14) 0%, transparent 70%)' }}
        />

        <div className="relative mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
          <div className="space-y-5">
            <nav aria-label="パンくずリスト" className="flex flex-wrap items-center gap-1 text-[10px] text-white/35">
              <Link href="/verity" className="transition-colors hover:text-fuchsia-300/80">VERITY</Link>
              <ChevronRight size={10} />
              <Link href="/verity/features" className="transition-colors hover:text-fuchsia-300/80">Spotlight</Link>
              <ChevronRight size={10} />
              <span className="text-fuchsia-300/60">{AIZAWA_MIYU_META.title}</span>
            </nav>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
              <Sparkles size={10} />
              {AIZAWA_MIYU_META.seriesLabel}
            </span>

            <h1 className="text-[30px] font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl" style={{ textShadow: '0 0 60px rgba(217,70,239,0.4)' }}>
              {AIZAWA_MIYU_META.h1}
            </h1>

            <p className="max-w-2xl text-[14px] font-bold leading-relaxed text-fuchsia-200/90 sm:text-lg">{AIZAWA_MIYU_META.subCopy}</p>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <a
                href="#now"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(217,70,239,0.5)]"
              >
                いま観るなら
              </a>
              <SpotlightLink
                href={ACTRESS_HREF}
                slug={SLUG}
                placement="page_actress"
                destination={AIZAWA_MIYU_META.actressExternalId}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/85 transition-all hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10"
              >
                <User size={14} />
                {AIZAWA_MIYU_META.actressName}の女優ページ
              </SpotlightLink>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-16 px-4 py-14">
        {/* ② INTRODUCTION */}
        <section className="space-y-6">
          <SectionHeader label="なぜ今、逢沢みゆなのか" />
          <ProseBlock>
            <p>
              逢沢みゆは、元アイドルという経歴を経て<strong className="font-bold text-white/85">S1専属AV女優としてデビュー</strong>した。
              専属期間を経たのち、現在は特定の一社に閉じない<strong className="font-bold text-white/85">企画単体女優</strong>として、
              複数のメーカーを横断しながら出演を重ねている。
            </p>
            <p>
              2024年後半以降、出演メーカーの顔ぶれは大きく広がった。職業ものからコスプレ、VR作品まで、任される役柄と表現の幅は明らかに広い。
              そしていま、<strong className="font-bold text-white/85">MOODYZ「ドリームウーマン」</strong>という大手メーカーの看板シリーズに
              名を連ねるところまで辿り着いた。
            </p>
            <p>
              本特集では、アイドル期からS1専属デビュー、企画単体化を経て現在に至るまでの作品を、
              <strong className="font-bold text-white/85">ORIGIN・PURE・BODY・PASSION・FANTASY</strong>の5つのテーマで読み解く。
              いま、逢沢みゆが面白い。
            </p>
          </ProseBlock>
        </section>

        {/* ③ NOW */}
        <section id="now" className="space-y-6">
          <SectionHeader label="NOW — いまの逢沢みゆ" />
          <div className="grid gap-5 sm:grid-cols-2">
            {comingNextArticle && (
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/50 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
                  COMING NEXT
                </span>
                <WorkCard
                  article={comingNextArticle}
                  isOverseas={isOverseas}
                  position="spotlight_aizawa_miyu_image"
                  sectionBadge="now_coming_next"
                  reason="専属を離れ企画単体女優として歩んできた彼女が、いま大手メーカーの看板シリーズに名を連ねる——本特集はこの1本を起点にしている。"
                  editorPick
                />
                {comingNextReservation && (
                  <p className="text-[10px] text-white/35">
                    {comingNextReservation.isFuture ? '配信/発売開始日: ' : '配信/発売日: '}
                    {fmtDate(comingNextArticle.published_at)}
                  </p>
                )}
              </div>
            )}
            {availableNowArticle && (
              <div className="space-y-2">
                <span className="inline-flex items-center rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                  AVAILABLE NOW
                </span>
                <WorkCard
                  article={availableNowArticle}
                  isOverseas={isOverseas}
                  position="spotlight_aizawa_miyu_image"
                  sectionBadge="now_available"
                  reason="Vol.101の配信を待つ間に、今すぐ観られる直近の最新作。"
                />
              </div>
            )}
          </div>
        </section>

        {/* ④ カテゴリ（ORIGIN/PURE/BODY/PASSION/FANTASY） */}
        {CATEGORIES.map((cat) => {
          const works = worksByCategory.get(cat.key) ?? []
          if (works.length === 0) return null
          const pick = EDITORS_PICK[cat.key]
          const pickArticle = articleByCid.get(pick.cid)
          const otherWorks = works.filter((w) => w.article.external_id !== pick.cid)
          return (
            <section key={cat.key} className="space-y-5">
              <div className="space-y-3">
                <SectionHeader label={cat.label} count={works.length} />
                <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">{cat.comment}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {pickArticle && (
                  <div className="col-span-2 row-span-2 sm:col-span-1">
                    <WorkCard
                      article={pickArticle}
                      isOverseas={isOverseas}
                      position="spotlight_aizawa_miyu_image"
                      sectionBadge={cat.badge}
                      reason={pick.comment}
                      editorPick
                    />
                  </div>
                )}
                {otherWorks.map((w, i) => (
                  <WorkCard
                    key={w.article.id}
                    article={w.article}
                    isOverseas={isOverseas}
                    position="spotlight_aizawa_miyu_image"
                    sectionBadge={cat.badge}
                    reason={w.reason}
                    index={i + 1}
                  />
                ))}
              </div>
            </section>
          )
        })}

        <p className="text-center text-[10px] text-white/25">※ 18歳以上を対象としたアダルトコンテンツです</p>

        {/* ⑤ VERITY PICKS */}
        {verityPicksResolved.length > 0 && (
          <section className="space-y-6">
            <SectionHeader label="VERITY PICKS — 迷ったらこの作品" count={verityPicksResolved.length} />
            <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
              目的別の入口をまとめました。気になる軸から一本選んでみてください。
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {verityPicksResolved.map(({ axis, article }) => (
                <div key={axis.key} className="space-y-2">
                  <span className="inline-flex items-center rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] font-bold text-fuchsia-300">
                    {axis.label}
                  </span>
                  <WorkCard
                    article={article}
                    isOverseas={isOverseas}
                    position="spotlight_aizawa_miyu_image"
                    sectionBadge="verity_pick"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ⑥ MORE MIYU */}
        <section className="space-y-6">
          <SectionHeader label="MORE MIYU — もっと逢沢みゆを観る" count={catalogPage.total} />
          <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
            VERITYが把握している逢沢みゆの作品（単独主演・配信/発売済み）をまとめて探せます。同一作品の配信版/DVD版はまとめて表示しています。
          </p>
          <MoreMiyuCatalog
            initialItems={catalogPage.items}
            initialTotal={catalogPage.total}
            initialHasMore={catalogPage.hasMore}
            isOverseas={isOverseas}
          />
        </section>

        {/* ⑦ 編集部より */}
        <section className="space-y-6">
          <SectionHeader label="編集部より" />
          <div className="relative rounded-2xl border border-white/10 bg-black/35 p-6 backdrop-blur-sm sm:p-8">
            <BookOpen size={20} className="mb-4 text-fuchsia-300/60" />
            <div className="space-y-4 text-[13px] leading-loose text-white/65 sm:text-[14px]">
              <p>
                アイドルからAV女優へ。専属期を経て企画単体女優へ。逢沢みゆのキャリアは、その時々で違う顔を見せてきた。
                本特集で紹介した作品はその一部にすぎない。MORE MIYUではさらに多くの作品を探せるようにしている。
              </p>
              <p>MOODYZ「ドリームウーマン Vol.101」を起点に、VERITYでは引き続き彼女の新作を追いかけていく。</p>
              <p className="text-right text-[12px] italic text-white/40">— VERITY 編集部</p>
            </div>
          </div>
        </section>

        {/* ⑧ 関連導線 + FINAL CTA */}
        <section className="space-y-8">
          <div className="h-px w-full" style={{ background: 'linear-gradient(to right, transparent, rgba(217,70,239,0.3), transparent)' }} />
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-white/30">Related</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SpotlightLink
              href={ACTRESS_HREF}
              slug={SLUG}
              placement="page_actress"
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4 transition-all hover:border-fuchsia-400/40 hover:bg-fuchsia-500/5"
            >
              <div>
                <p className="text-[12px] font-bold text-white/70 transition-colors group-hover:text-fuchsia-300">{AIZAWA_MIYU_META.actressName}の女優ページ</p>
                <p className="text-[10px] text-white/35">プロフィールと最新出演作</p>
              </div>
              <ChevronRight size={14} className="shrink-0 text-white/25 transition-colors group-hover:text-fuchsia-300" />
            </SpotlightLink>
            <SpotlightLink
              href="/verity/features"
              slug={SLUG}
              placement="page_related_spotlight"
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-4 transition-all hover:border-fuchsia-400/40 hover:bg-fuchsia-500/5"
            >
              <div>
                <p className="text-[12px] font-bold text-white/70 transition-colors group-hover:text-fuchsia-300">特集一覧</p>
                <p className="text-[10px] text-white/35">VERITY Spotlight</p>
              </div>
              <ChevronRight size={14} className="shrink-0 text-white/25 transition-colors group-hover:text-fuchsia-300" />
            </SpotlightLink>
          </div>

          {heroArticle && affiliateUrl(heroArticle, isOverseas) && (
            <div className="text-center">
              <FanzaLink
                href={affiliateUrl(heroArticle, isOverseas)!}
                targetId={heroArticle.external_id}
                position="spotlight_aizawa_miyu_footer"
                meta={{
                  source: 'spotlight',
                  spotlight_slug: SLUG,
                  spotlight_section: 'footer_cta',
                  actress_name: AIZAWA_MIYU_META.actressName,
                  work_title: heroArticle.title,
                }}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-purple-600 px-6 py-3 text-sm font-bold text-white transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(217,70,239,0.45)]"
              >
                FANZAで{AIZAWA_MIYU_META.actressName}の作品をもっと見る
                <ExternalLink size={13} />
              </FanzaLink>
            </div>
          )}
        </section>

        <div className="space-y-3 text-center">
          <p className="text-[10px] text-white/20">
            <span className="mr-1.5 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-white/40">PR</span>
            FANZAへのリンクはアフィリエイトリンクです
          </p>
          <Link href="/verity" className="inline-flex items-center gap-1 text-sm text-white/30 transition-colors hover:text-fuchsia-300/60">
            <Heart size={12} />
            VERITYトップへ戻る
          </Link>
        </div>
      </div>
    </div>
  )
}
