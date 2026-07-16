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
  Store,
  Glasses,
  Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { RelatedWorksScored } from '@/components/RelatedWorksScored'
import { RelatedArticlesSection } from '@/components/RelatedArticlesSection'
import { SpotlightViewTracker } from '@/components/SpotlightViewTracker'
import { StoreOsCtaLink } from '@/components/StoreOsCtaLink'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import { getMensEstheSlugs, MENS_ESTHE_META } from '@/lib/mensEsthe'
import type { Article } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
// 公開URLはベアパス（proxy が /verity/ へリライト）。記事ページと同じSEOパターン。
const CANONICAL = `${BASE}/spotlight/mens-esthe`
const STOREOS_URL =
  'https://storeos-brown.vercel.app/mens-esthe?utm_source=verity&utm_medium=spotlight&utm_campaign=mens-esthe&ref=verity'

// ── データ取得 ────────────────────────────────────────────────────────────────

/** slug 配列で記事を取得し、渡された順序を保持して返す（存在しない slug は除外） */
async function getArticlesBySlugs(slugs: string[]): Promise<Article[]> {
  if (slugs.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, slug, source, category, tags, summary, image_url, published_at, metadata')
    .eq('is_active', true)
    .in('slug', slugs)
  if (error) console.error('[spotlight/mens-esthe]', error.message)
  const map = new Map(((data as Article[]) ?? []).map((a) => [a.slug, a]))
  return slugs.map((s) => map.get(s)).filter(Boolean) as Article[]
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

function actressNames(article: Article): string[] {
  const list = article.metadata?.actress
  if (!Array.isArray(list)) return []
  return (list as NamedRef[]).map((a) => a?.name).filter((n): n is string => !!n)
}

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

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata() {
  const hero = (await getArticlesBySlugs([MENS_ESTHE_META.heroSlug]))[0] ?? null
  const heroImg = hero ? proxiedJacket(hero) : null
  const ogImage = heroImg ? `${BASE}${heroImg}` : undefined

  const title = MENS_ESTHE_META.seoTitle
  const description = MENS_ESTHE_META.seoDescription

  return {
    title,
    description,
    alternates: { canonical: CANONICAL },
    openGraph: {
      title,
      description,
      type: 'article',
      url: CANONICAL,
      publishedTime: MENS_ESTHE_META.publishedAt,
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
 * 構造化データ（Article + BreadcrumbList）を JSON 文字列で構築。
 * metadata の other['script:ld+json'] はこの Next バージョンでは <meta> として
 * 出力され構造化データとして機能しないため、ボディにインライン <script> で注入する
 * （記事詳細ページと同じ確実な方式）。
 */
function buildJsonLd(ogImage: string | null): string {
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: MENS_ESTHE_META.seoTitle,
      description: MENS_ESTHE_META.seoDescription,
      datePublished: MENS_ESTHE_META.publishedAt,
      ...(ogImage ? { image: ogImage } : {}),
      author: { '@type': 'Organization', name: 'VERITY 編集部' },
      publisher: { '@type': 'Organization', name: 'VERITY' },
      mainEntityOfPage: CANONICAL,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'VERITY', item: `${BASE}/verity` },
        { '@type': 'ListItem', position: 2, name: 'Spotlight', item: `${BASE}/verity/features` },
        { '@type': 'ListItem', position: 3, name: MENS_ESTHE_META.title, item: CANONICAL },
      ],
    },
  ])
}

// ── セクションヘッダー ────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-6 w-1 rounded-full"
        style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.15))' }}
      />
      <h2 className="text-lg font-bold text-[#d4af37] sm:text-xl">{label}</h2>
      {count !== undefined && (
        <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#d4af37]">
          {count}件
        </span>
      )}
    </div>
  )
}

// ── 編集コラム（読み物）ブロック ──────────────────────────────────────────────

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

// ── 特徴カード ────────────────────────────────────────────────────────────────

function PointCard({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="flex gap-4 rounded-xl border border-[#d4af37]/15 bg-black/35 p-5 backdrop-blur-sm transition-colors hover:border-[#d4af37]/35">
      <span className="shrink-0 text-2xl leading-none">{emoji}</span>
      <div className="space-y-1.5">
        <p className="text-[13px] font-bold text-[#d4af37]">{title}</p>
        <p className="text-[12px] leading-relaxed text-white/55">{body}</p>
      </div>
    </div>
  )
}

// ── 作品カード ────────────────────────────────────────────────────────────────

function WorkCard({
  article,
  fanzaUrl,
  section,
  index,
}: {
  article: Article
  fanzaUrl: string | null
  section: 'normal' | 'vr'
  /** グループ内の 1 始まりの並び順 */
  index: number
}) {
  const imgSrc = proxiedJacket(article)
  const actresses = actressNames(article)
  const maker = makerName(article)

  // 作品カードクリック計測メタ（既存 fanza_click に付与。取得不能な値は省略する）。
  // ※ position（UI導線文字列）は既存集計と互換のため温存し、1始まりの並び順は
  //    予約キー position を汚さないよう spotlight_position に格納する。
  const clickMeta: Record<string, unknown> = {
    source: 'spotlight',
    spotlight_slug: 'mens-esthe',
    spotlight_section: section,
    spotlight_position: index,
    article_slug: article.slug,
    work_title: article.title,
    ...(actresses.length ? { actress_name: actresses.join('・') } : {}),
    ...(maker ? { maker_name: maker } : {}),
  }

  // 表紙の中身（画像 + グラデ + ホバーラベル）。FanzaLink 内外で共有。
  const cover = (
    <>
      <ProxiedImage
        src={imgSrc!}
        alt={article.title}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
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
            position="spotlight_mens_esthe_image"
            meta={clickMeta}
            ariaLabel={`${article.title}をFANZAで観る`}
            className="absolute inset-0 block h-full w-full"
          >
            {cover}
          </FanzaLink>
        ) : (
          cover
        )}
      </div>

      {/* 本文 */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* タイトル（記事ページへ。遷移先で video_view が記録される） */}
        {article.slug ? (
          <Link href={`/verity/articles/${article.slug}`}>
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85 transition-colors group-hover:text-[#d4af37]/90">
              {article.title}
            </p>
          </Link>
        ) : (
          <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85">{article.title}</p>
        )}

        {/* 女優 */}
        {actresses.length > 0 && (
          <p className="line-clamp-1 text-[10px] font-semibold text-[#d4af37]/85">
            {actresses.slice(0, 3).join('・')}
            {actresses.length > 3 && ` +${actresses.length - 3}`}
          </p>
        )}

        {/* メーカー・発売日 */}
        <div className="mt-auto space-y-0.5">
          {maker && <p className="line-clamp-1 text-[9px] text-white/40">{maker}</p>}
          {article.published_at && <p className="text-[9px] text-[#d4af37]/50">{fmtDate(article.published_at)}</p>}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-1.5 pt-1">
          {fanzaUrl && (
            <FanzaLink
              href={fanzaUrl}
              targetId={article.external_id}
              position="spotlight_mens_esthe"
              meta={clickMeta}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#b8960c] to-[#d4af37] py-2 text-[10px] font-bold text-[#0a0800] transition-all hover:brightness-110"
            >
              FANZAで観る
              <ExternalLink size={9} />
            </FanzaLink>
          )}
          {article.slug && (
            <Link
              href={`/verity/articles/${article.slug}`}
              className="flex items-center justify-center gap-1 rounded-lg border border-[#d4af37]/25 py-1.5 text-[10px] font-bold text-[#d4af37]/70 transition-colors hover:border-[#d4af37]/50 hover:text-[#d4af37]"
            >
              記事へ
              <ChevronRight size={10} />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function MensEstheSpotlightPage() {
  const { normal, vr } = getMensEstheSlugs()

  const [normalArticles, vrArticles, isOverseas] = await Promise.all([
    getArticlesBySlugs(normal),
    getArticlesBySlugs(vr),
    getIsOverseasUser(),
  ])

  const heroArticle = normalArticles[0] ?? vrArticles[0] ?? null
  const heroImg = heroArticle ? proxiedJacket(heroArticle) : null
  const ogImageAbs = heroImg ? `${BASE}${heroImg}` : null
  const totalCount = normalArticles.length + vrArticles.length

  return (
    <div className="min-h-screen bg-[#0a0800]">
      {/* 表示計測 — spotlight_view を1表示1回だけ送信（汎用トラッカー） */}
      <SpotlightViewTracker
        slug={MENS_ESTHE_META.slug}
        title={MENS_ESTHE_META.title}
        workCount={totalCount}
        normalWorkCount={normalArticles.length}
        vrWorkCount={vrArticles.length}
      />

      {/* 構造化データ（Article + BreadcrumbList） */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildJsonLd(ogImageAbs) }}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          ① ヒーロー
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative flex min-h-[420px] items-end overflow-hidden border-b border-[#d4af37]/20 sm:min-h-[500px]">
        {/* 右側 ambient 背景 */}
        {heroImg && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 overflow-hidden sm:block">
            <ProxiedImage src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.22]" />
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
            <nav className="flex items-center gap-1 text-[10px] text-[#d4af37]/40">
              <Link href="/verity" className="transition-colors hover:text-[#d4af37]/70">
                VERITY
              </Link>
              <ChevronRight size={10} />
              <Link href="/verity/features" className="transition-colors hover:text-[#d4af37]/70">
                Spotlight
              </Link>
              <ChevronRight size={10} />
              <span className="text-[#d4af37]/60">メンズエステ作品特集</span>
            </nav>

            {/* シリーズラベル */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
              <Sparkles size={10} />
              {MENS_ESTHE_META.seriesLabel}
            </div>

            {/* タイトル（H1 は 1 つ） */}
            <h1
              className="text-4xl font-black tracking-tight text-[#d4af37] sm:text-6xl"
              style={{ textShadow: '0 0 56px rgba(212,175,55,0.5)' }}
            >
              メンズエステ作品特集
            </h1>

            {/* サブコピー */}
            <p className="max-w-lg text-base font-bold leading-relaxed text-white/70 sm:text-lg">
              癒やしという物語。
              <br className="hidden sm:block" />
              大人の空間を描いた名作たち。
            </p>

            <div className="pt-2">
              <a
                href="#verity-selection"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#b8960c] to-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#0a0800] transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(212,175,55,0.5)]"
              >
                <Star size={14} />
                特選作品を見る
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          メインコンテンツ
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-5xl space-y-16 px-4 py-14">
        {/* ② メンズエステとは？ */}
        <section className="space-y-6">
          <SectionHeader label="メンズエステとは？" />
          <ProseBlock>
            <p>
              メンズエステとは、男性を対象としたリラクゼーションを目的とするサービスです。日々の疲れを抱えた身体をほぐし、
              心身をゆるめる時間を提供する——それが本来のメンズエステという業態の姿です。
            </p>
            <p>
              多くの店舗は、生活音から切り離された<strong className="font-bold text-white/85">個室空間</strong>
              を舞台にしています。照明を落とした落ち着いた部屋、ほのかに香るアロマ、静かに流れる音楽。
              セラピストは丁寧な<strong className="font-bold text-white/85">接客</strong>
              で客を迎え、施術を通してゆっくりと緊張を解いていきます。
            </p>
            <p>
              重要なのは、そこにある体験が単なる作業ではなく<strong className="font-bold text-white/85">「癒やし」</strong>
              という一つの物語として設計されている点です。店舗ごとに内装も接客スタイルも、そして目指す
              <strong className="font-bold text-white/85">世界観</strong>
              も異なり、その違いこそがメンズエステという文化の奥行きを生んでいます。
            </p>
          </ProseBlock>

          {/* 編集部注記 — 実店舗と作品を混同させないための注意書き（警告色は使わず黒×金基調） */}
          <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-[#100d04]/60 p-5 backdrop-blur-sm sm:p-7">
            <div
              className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl"
              style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.08))' }}
            />
            <div className="mb-3.5 inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/35 bg-[#d4af37]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#d4af37]">
              <Info size={11} />
              編集部より
            </div>
            <div className="space-y-3 text-[12.5px] leading-loose text-white/60 sm:text-[13px]">
              <p>実際のメンズエステは、オイルトリートメントなどのリラクゼーションを提供するサービスです。</p>
              <p>
                本特集で紹介している作品に登場する性的な描写や本番行為などは、
                <strong className="font-bold text-white/85">あくまでフィクションとして制作された映像作品の演出</strong>
                であり、<strong className="font-bold text-white/85">実際の店舗で提供されるサービス内容とは異なります。</strong>
              </p>
              <p>
                VERITYでは、作品のジャンルとして「メンズエステ作品」を紹介していますが、実際の店舗やセラピストの皆さまが
                健全なサービスを提供されていることを尊重しています。
              </p>
              <p>VERITYでは作品だけでなく、実際に業界を支える店舗運営やサービスの発展にも関心を持っています。</p>
            </div>
          </div>
        </section>

        {/* ③ なぜメンズエステ作品は人気なのか */}
        <section className="space-y-6">
          <SectionHeader label="なぜメンズエステ作品は人気なのか" />
          <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
            過度な演出ではなく、シチュエーション作品としての完成度。メンズエステを舞台にした作品が支持される理由を、
            VERITY編集部の視点で紐解きます。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <PointCard
              emoji="🕯️"
              title="癒やしと非日常"
              body="日常から切り離された個室空間そのものが物語の舞台になる。照明・香り・静けさが積み重なり、観る側にも非日常の余韻を届けます。"
            />
            <PointCard
              emoji="🤝"
              title="心地よい距離感"
              body="施術という自然な接点を通して、少しずつ縮まっていく距離。急かさず丁寧に紡がれる関係性が、他ジャンルにはない情緒を生みます。"
            />
            <PointCard
              emoji="✨"
              title="高級感のある演出"
              body="上質な内装、洗練された所作、静かな時間の流れ。作品全体に漂う高級感が、シチュエーションに説得力と没入感を与えます。"
            />
            <PointCard
              emoji="📖"
              title="物語性とセラピスト像"
              body="セラピストという存在に宿るプロフェッショナリズムと人柄。単なる設定を超えたキャラクター性が、作品を一つの物語として成立させます。"
            />
          </div>
        </section>

        {/* ④ VERITY編集部が注目するポイント */}
        <section className="space-y-6">
          <SectionHeader label="VERITY編集部が注目するポイント" />
          <div className="grid gap-4 sm:grid-cols-2">
            <PointCard
              emoji="💆"
              title="施術シーンの空気感"
              body="手のひらの動き、間の取り方、呼吸。施術シーンにどれだけ丁寧な空気が流れているかを、編集部はまず見ています。"
            />
            <PointCard
              emoji="🏛️"
              title="高級感ある演出"
              body="セットや照明、小物の質感。空間演出が世界観と噛み合っているかどうかが、作品の格を大きく左右します。"
            />
            <PointCard
              emoji="🌙"
              title="女優さんの表情"
              body="言葉ではなく表情で語られる感情の機微。癒やしのジャンルだからこそ、繊細な表情の演技に注目が集まります。"
            />
            <PointCard
              emoji="🎬"
              title="没入感と作品全体の完成度"
              body="導入から余韻まで途切れない没入感。個々のシーンだけでなく、一本の作品としてまとまっているかを重視します。"
            />
          </div>
        </section>

        {/* ⑤ VERITY特選！メンズエステ作品 */}
        <section id="verity-selection" className="space-y-8">
          <div className="space-y-3">
            <SectionHeader label="VERITY特選！メンズエステ作品" count={totalCount} />
            <p className="max-w-3xl text-[13px] leading-relaxed text-white/50">
              VERITY編集部が選んだメンズエステ作品を一覧でご紹介します。「通常作品」と「VR作品」に分けて掲載。
              気になる作品はカードから記事ページへ、そのままFANZAでチェックいただけます。
            </p>
          </div>

          {/* 通常作品グループ */}
          {normalArticles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Star size={14} className="text-[#d4af37]" />
                <h3 className="text-[13px] font-bold tracking-wide text-[#d4af37]/90">通常作品</h3>
                <span className="text-[11px] text-[#d4af37]/40">{normalArticles.length}件</span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {normalArticles.map((article, i) => (
                  <WorkCard
                    key={article.id}
                    article={article}
                    fanzaUrl={affiliateUrl(article, isOverseas)}
                    section="normal"
                    index={i + 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* VR作品グループ */}
          {vrArticles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Glasses size={15} className="text-[#d4af37]" />
                <h3 className="text-[13px] font-bold tracking-wide text-[#d4af37]/90">VR作品</h3>
                <span className="text-[11px] text-[#d4af37]/40">{vrArticles.length}件</span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {vrArticles.map((article, i) => (
                  <WorkCard
                    key={article.id}
                    article={article}
                    fanzaUrl={affiliateUrl(article, isOverseas)}
                    section="vr"
                    index={i + 1}
                  />
                ))}
              </div>
            </div>
          )}

          <p className="text-center text-[10px] text-white/25">※ 18歳以上を対象としたアダルトコンテンツです</p>
        </section>

        {/* ⑥ 編集部より */}
        <section className="space-y-6">
          <SectionHeader label="編集部より" />
          <div className="relative rounded-2xl border border-[#d4af37]/20 bg-black/35 p-6 backdrop-blur-sm sm:p-8">
            <BookOpen size={20} className="mb-4 text-[#d4af37]/60" />
            <div className="space-y-4 text-[13px] leading-loose text-white/65 sm:text-[14px]">
              <p>
                メンズエステ作品には、癒やし・空間演出・距離感といった、他ジャンルにはない独特の魅力があります。
                派手さで押し切るのではなく、静かな時間の積み重ねで観る人の心をほどいていく——そんな作品ならではの美点が、
                このジャンルには確かに宿っています。
              </p>
              <p>
                VERITYはこれからも、シチュエーション作品としてのメンズエステの奥行きを丁寧に掘り下げ、
                本特集へ定期的に名作を追加していきます。あなたのお気に入りの一本が、この特集の中で見つかることを願って。
              </p>
              <p className="text-right text-[12px] italic text-white/40">— VERITY 編集部</p>
            </div>
          </div>
        </section>

        {/* ⑦ StoreOS 紹介 */}
        <section className="space-y-6">
          <SectionHeader label="メンズエステ業界も応援しています" />
          <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/25 bg-gradient-to-br from-black/50 to-[#12100a]/60 p-6 backdrop-blur-sm sm:p-8">
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden
              style={{ background: 'radial-gradient(ellipse 60% 80% at 100% 0%, rgba(212,175,55,0.10) 0%, transparent 70%)' }}
            />
            <div className="relative space-y-5">
              <div className="flex items-center gap-2.5">
                <Store size={18} className="text-[#d4af37]" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#d4af37]/70">For Store Owners</span>
              </div>

              <p className="text-[13px] leading-loose text-white/65 sm:text-[14px]">
                VERITYは作品だけでなく、メンズエステという業界そのものも応援したいと考えています。
                全国50店舗以上を独自に分析した結果、多くの店舗が
                <strong className="font-bold text-white/85">予約・SNS・店舗サイト・顧客管理</strong>
                といった複数のサービスを組み合わせて運営している実態が見えてきました。
              </p>
              <p className="text-[13px] leading-loose text-white/65 sm:text-[14px]">
                そこで開発したのが、店舗運営をひとつにまとめる<strong className="font-bold text-[#d4af37]">StoreOS</strong>です。
              </p>

              {/* カード形式の分析ポイント */}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { title: '全国50店舗を独自分析', body: '現場の運営実態を丁寧にリサーチして設計。' },
                  { title: '既存店舗対応', body: '今の運営フローに無理なく組み込めます。' },
                  { title: '新規開業対応', body: 'これから始める店舗の立ち上げも支援。' },
                ].map((c) => (
                  <div
                    key={c.title}
                    className="rounded-xl border border-[#d4af37]/15 bg-black/40 p-4 transition-colors hover:border-[#d4af37]/35"
                  >
                    <p className="mb-1.5 text-[12px] font-bold text-[#d4af37]">{c.title}</p>
                    <p className="text-[11px] leading-relaxed text-white/50">{c.body}</p>
                  </div>
                ))}
              </div>

              <div className="pt-1">
                <StoreOsCtaLink
                  href={STOREOS_URL}
                  slug={MENS_ESTHE_META.slug}
                  placement="industry_support"
                  destination="mens-esthe-lp"
                  className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-5 py-2.5 text-sm font-bold text-[#d4af37] transition-all hover:border-[#d4af37]/70 hover:bg-[#d4af37]/20"
                >
                  店舗運営者向けStoreOSはこちら
                  <ExternalLink size={13} />
                </StoreOsCtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* ⑧ 関連（既存ロジック） */}
        {heroArticle && (
          <section className="space-y-10">
            <div
              className="h-px w-full"
              style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.3), transparent)' }}
            />
            <p className="text-center text-[11px] font-bold uppercase tracking-widest text-[#d4af37]/40">Related</p>
            <RelatedWorksScored article={heroArticle} />
            <RelatedArticlesSection article={heroArticle} />
            <div className="grid gap-3 sm:grid-cols-3">
              <RelatedLink href="/verity/features" label="特集一覧" sub="VERITY Spotlight" />
              <RelatedLink href="/verity/ranking" label="ランキング" sub="人気作品ランキング" />
              <RelatedLink href="/verity" label="VERITYトップ" sub="最新作をチェック" />
            </div>
          </section>
        )}

        {/* PR 表示 */}
        <div className="space-y-3 text-center">
          <p className="text-[10px] text-white/20">
            <span className="mr-1.5 rounded border border-[#d4af37]/20 bg-[#d4af37]/8 px-1.5 py-0.5 text-[9px] font-bold text-[#d4af37]/40">
              PR
            </span>
            FANZAへのリンクはアフィリエイトリンクです
          </p>
          <Link href="/verity" className="inline-flex items-center gap-1 text-sm text-white/30 transition-colors hover:text-[#d4af37]/60">
            <Heart size={12} />
            VERITYトップへ戻る
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── 小コンポーネント ──────────────────────────────────────────────────────────

function RelatedLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-[#d4af37]/15 bg-black/30 p-4 transition-all hover:border-[#d4af37]/40 hover:bg-[#d4af37]/5"
    >
      <div>
        <p className="text-[12px] font-bold text-white/70 transition-colors group-hover:text-[#d4af37]">{label}</p>
        <p className="text-[10px] text-[#d4af37]/40">{sub}</p>
      </div>
      <ChevronRight size={14} className="text-[#d4af37]/30 transition-colors group-hover:text-[#d4af37]/70" />
    </Link>
  )
}
