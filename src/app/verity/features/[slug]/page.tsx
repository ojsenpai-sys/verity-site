export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  ExternalLink,
  BookOpen,
  BarChart3,
  Star,
  ChevronRight,
  MessageCircle,
  Clock,
  Play,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import { getFeature, getAllFeatures } from '@/lib/features'
import type { SampleVideo } from '@/lib/features'
import { TweetEmbedBlock } from '@/components/TweetEmbedBlock'
import type { Article, Actress } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

// ── generateMetadata ──────────────────────────────────────────────────────────

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const feature = getFeature(slug)
  if (!feature) return {}

  const title = `${feature.actressName} — ${feature.seriesLabel} | VERITY`
  return {
    title,
    description: feature.seoDescription,
    alternates: { canonical: `${BASE}/verity/features/${slug}` },
    openGraph: {
      title,
      description: feature.seoDescription,
      type: 'article',
      publishedTime: feature.publishedAt,
    },
    other: {
      'script:ld+json': JSON.stringify([
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: title,
          description: feature.seoDescription,
          datePublished: feature.publishedAt,
          publisher: { '@type': 'Organization', name: 'VERITY' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'VERITY', item: `${BASE}/verity` },
            { '@type': 'ListItem', position: 2, name: 'Spotlight', item: `${BASE}/verity/features` },
            { '@type': 'ListItem', position: 3, name: feature.actressName, item: `${BASE}/verity/features/${slug}` },
          ],
        },
      ]),
    },
  }
}

// ── データ取得 ────────────────────────────────────────────────────────────────

async function getArticlesByTag(tag: string, limit = 20): Promise<Article[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, slug, image_url, metadata, published_at, tags')
    .eq('is_active', true)
    .contains('tags', [tag])
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[features/detail]', error.message)
  return (data as Article[]) ?? []
}

async function getArticlesByCids(cids: string[]): Promise<Article[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, slug, image_url, metadata, published_at, tags')
    .eq('is_active', true)
    .in('external_id', cids)
  if (error) console.error('[features/detail cids]', error.message)
  const map = new Map(((data as Article[]) ?? []).map((a) => [a.external_id, a]))
  return cids.map((c) => map.get(c)).filter(Boolean) as Article[]
}

async function getActressByName(name: string): Promise<Actress | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('id, external_id, name, ruby, image_url, metadata, is_active')
    .eq('name', name)
    .eq('is_active', true)
    .limit(1)
    .single()
  return (data as Actress | null) ?? null
}

// ── 画像ユーティリティ ────────────────────────────────────────────────────────

function proxiedJacket(article: Article): string {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
}

function proxiedActress(actress: Actress): string | null {
  if (isBadImageUrl(actress.image_url)) return null
  return `/verity/api/proxy/image?url=${encodeURIComponent(actress.image_url!)}`
}

function affiliateUrl(article: Article, isOverseas: boolean): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string'
      ? article.metadata.url
      : null
  return withAffiliateForRegion(raw as string | null, isOverseas)
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function isUpcoming(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() > Date.now()
}

// ── Markdown レンダラー（依存ゼロ・XSS安全） ─────────────────────────────────

function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  for (const line of lines) {
    const esc = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    if (esc.startsWith('## ')) {
      out.push(`<h2>${esc.slice(3)}</h2>`)
    } else if (esc.startsWith('### ')) {
      out.push(`<h3>${esc.slice(4)}</h3>`)
    } else if (line.trim() === '---') {
      out.push('<hr />')
    } else if (esc.trim() === '') {
      out.push('<br />')
    } else {
      const inline = esc
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
      out.push(`<p>${inline}</p>`)
    }
  }
  return out.join('\n')
}

// ── セクションヘッダー ────────────────────────────────────────────────────────

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-6 w-1 rounded-full"
        style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.15))' }}
      />
      <span className="text-[#d4af37]">{icon}</span>
      <h2 className="text-lg font-bold text-[#d4af37]">{label}</h2>
      {count !== undefined && (
        <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#d4af37]">
          {count}件
        </span>
      )}
    </div>
  )
}

// ── 作品カード ────────────────────────────────────────────────────────────────

function WorkCard({ article, fanzaUrl, large = false }: { article: Article; fanzaUrl: string | null; large?: boolean }) {
  const imgSrc = proxiedJacket(article)
  const upcoming = isUpcoming(article.published_at)

  const inner = (
    <article className={`group relative flex flex-col overflow-hidden rounded-xl border border-[#d4af37]/20 bg-black/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-[0_0_28px_rgba(212,175,55,0.18)]`}>
      <div className={`relative ${large ? 'aspect-[2/3]' : 'aspect-[2/3]'} w-full overflow-hidden bg-[#0d0a00]`}>
        <ProxiedImage
          src={imgSrc}
          alt={article.title}
          className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {upcoming && (
          <span className="absolute left-2 top-2 rounded-r-full bg-sky-600 px-3 py-0.5 text-[10px] font-bold tracking-wider text-white shadow">
            予約受付中
          </span>
        )}

        {/* ホバーオーバーレイ */}
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/50 md:flex">
          <span className="translate-y-1 scale-95 rounded-full bg-[#d4af37]/90 px-3 py-1 text-[10px] font-bold text-[#0a0800] opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
            ▶ FANZAで観る
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {article.slug ? (
          <Link href={`/verity/articles/${article.slug}`}>
            <p className={`font-medium leading-snug text-white/85 transition-colors group-hover:text-[#d4af37]/90 line-clamp-2 ${large ? 'text-[12px]' : 'text-[11px]'}`}>
              {article.title}
            </p>
          </Link>
        ) : (
          <p className={`font-medium leading-snug text-white/85 line-clamp-2 ${large ? 'text-[12px]' : 'text-[11px]'}`}>
            {article.title}
          </p>
        )}
        {article.published_at && (
          <p className="text-[9px] text-[#d4af37]/50">{fmtDate(article.published_at)}</p>
        )}
        {fanzaUrl && (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position="spotlight_feature"
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold text-[#0a0800] transition-all hover:brightness-110 bg-gradient-to-r from-[#b8960c] to-[#d4af37]"
          >
            {upcoming ? '今すぐ予約' : 'FANZAで観る'}
            <ExternalLink size={9} />
          </FanzaLink>
        )}
      </div>
    </article>
  )

  return fanzaUrl ? (
    <FanzaLink href={fanzaUrl} targetId={article.external_id} position="spotlight_card_image" className="contents">
      {inner}
    </FanzaLink>
  ) : inner
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function FeatureDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const feature = getFeature(slug)
  if (!feature) notFound()

  const [allArticles, actress, isOverseas] = await Promise.all([
    getArticlesByTag(feature.actressTag, 30),
    getActressByName(feature.actressName),
    getIsOverseasUser(),
  ])

  // 特集CIDが指定されていれば優先、なければ上位6件
  const featuredArticles = feature.featuredCids?.length
    ? await getArticlesByCids(feature.featuredCids)
    : allArticles.slice(0, 6)

  const heroArticle = allArticles[0] ?? null
  const actressImgUrl = actress ? proxiedActress(actress) : null
  const heroImgUrl = heroArticle ? proxiedJacket(heroArticle) : null
  // external_id は 'dmm-actress-XXXXXXX' 形式で格納されているため prefix を付けない
  const actressPageHref = actress
    ? `/verity/actresses/${actress.external_id}`
    : null

  const totalCount = allArticles.length
  const latestDate = allArticles[0]?.published_at ?? null

  return (
    <div className="min-h-screen bg-[#0a0800]">

      {/* ══════════════════════════════════════════════════════════════════════
          ヒーローセクション
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="relative min-h-[480px] sm:min-h-[560px] overflow-hidden flex items-end">
        {/* 右側 ambient 背景 — フルスプレッドをうっすら表示し右フェードでなじませる */}
        {heroImgUrl && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden sm:block w-1/2 overflow-hidden">
            <ProxiedImage
              src={heroImgUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-[0.28]"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to right, #0a0800 0%, rgba(10,8,0,0.6) 28%, rgba(10,8,0,0.1) 70%, transparent 100%)',
              }}
            />
          </div>
        )}

        {/* グラデーションオーバーレイ（下→上） */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, #0a0800 25%, rgba(10,8,0,0.70) 55%, rgba(10,8,0,0.35) 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 30% 50%, rgba(212,175,55,0.12) 0%, transparent 70%)',
          }}
        />

        {/* コンテンツ */}
        <div className="relative mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-10">
            {/* パッケージ表紙カード — aspect-[2/3] + object-right で正面のみ表示 */}
            {heroImgUrl && (
              <div className="hidden sm:block shrink-0">
                <div className="relative aspect-[2/3] w-36 overflow-hidden rounded-2xl border border-[#d4af37]/30 shadow-[0_0_40px_rgba(212,175,55,0.2)]">
                  <ProxiedImage
                    src={heroImgUrl}
                    alt={feature.actressName}
                    className="absolute inset-0 h-full w-full object-cover object-right"
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* パンくず */}
              <nav className="flex items-center gap-1 text-[10px] text-[#d4af37]/40">
                <Link href="/verity" className="hover:text-[#d4af37]/70 transition-colors">VERITY</Link>
                <ChevronRight size={10} />
                <Link href="/verity/features" className="hover:text-[#d4af37]/70 transition-colors">Spotlight</Link>
                <ChevronRight size={10} />
                <span className="text-[#d4af37]/60">{feature.actressName}</span>
              </nav>

              {/* シリーズラベル */}
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-[#d4af37]">
                <Sparkles size={10} />
                {feature.seriesLabel}
              </div>

              {/* 女優名 */}
              <h1
                className="text-4xl sm:text-6xl font-black tracking-tight text-[#d4af37]"
                style={{ textShadow: '0 0 56px rgba(212,175,55,0.5)' }}
              >
                {feature.actressName}
              </h1>

              {/* キャッチコピー */}
              <p className="max-w-lg text-base sm:text-lg font-bold text-white/70 leading-relaxed">
                {feature.tagline}
              </p>
              <p className="max-w-xl text-sm text-white/45 leading-relaxed">
                {feature.description}
              </p>

              {/* CTAボタン */}
              {heroArticle && (
                <div className="pt-2">
                  <a
                    href="#featured-works"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#b8960c] to-[#d4af37] px-5 py-2.5 text-sm font-bold text-[#0a0800] transition-all hover:brightness-110 hover:shadow-[0_0_24px_rgba(212,175,55,0.5)]"
                  >
                    <Star size={14} />
                    作品を見る
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          メインコンテンツ
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-5xl space-y-16 px-4 py-14">

        {/* ── セクション1: なぜ注目されているのか ── */}
        <section className="space-y-6">
          <SectionHeader icon={<Sparkles size={18} />} label="なぜ今注目されているのか" />
          <div className="grid gap-4 sm:grid-cols-2">
            {feature.whyNotable.map((item, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-xl border border-[#d4af37]/15 bg-black/35 p-5 backdrop-blur-sm transition-colors hover:border-[#d4af37]/35"
              >
                <span className="text-2xl leading-none shrink-0">{item.emoji}</span>
                <div className="space-y-1.5">
                  <p className="font-bold text-[#d4af37] text-[13px]">{item.title}</p>
                  <p className="text-[12px] leading-relaxed text-white/55">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── セクション2: 数字で見る ── */}
        <section className="space-y-6">
          <SectionHeader icon={<BarChart3 size={18} />} label={`数字で見る${feature.actressName}`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* 自動集計 */}
            <StatCard label="掲載作品数" value={String(totalCount)} unit="件" />
            {latestDate && (
              <StatCard label="最新作発売日" value={fmtDate(latestDate)} />
            )}
            {/* 手動スタット */}
            {feature.manualStats?.map((s, i) => (
              <StatCard key={i} label={s.label} value={s.value} unit={s.unit} />
            ))}
          </div>
        </section>

        {/* ── セクション3: 注目作品 ── */}
        {featuredArticles.length > 0 && (
          <section id="featured-works" className="space-y-6">
            <SectionHeader icon={<Star size={18} />} label="注目作品" count={featuredArticles.length} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {featuredArticles.map((article) => (
                <WorkCard
                  key={article.id}
                  article={article}
                  fanzaUrl={affiliateUrl(article, isOverseas)}
                  large
                />
              ))}
            </div>
            {allArticles.length > featuredArticles.length && (
              <div className="text-center pt-2">
                <Link
                  href={`/verity?tag=${encodeURIComponent(feature.actressTag)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/8 px-5 py-2 text-[12px] font-bold text-[#d4af37] transition-all hover:border-[#d4af37]/60 hover:bg-[#d4af37]/15"
                >
                  全{allArticles.length}件の作品を見る
                  <ChevronRight size={12} />
                </Link>
              </div>
            )}
          </section>
        )}

        {/* ── サンプル動画セクション ── */}
        {feature.sampleVideos && feature.sampleVideos.length > 0 && (
          <section id="sample-movies" className="space-y-6">
            <SectionHeader icon={<Play size={18} />} label="PREVIEW / サンプル動画" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {feature.sampleVideos.map((video: SampleVideo, i: number) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl border border-[#c5a059]/20 bg-black/40 p-3 shadow-[0_0_28px_rgba(197,160,89,0.08)] backdrop-blur-sm"
                >
                  {/* 16:9 aspect wrapper */}
                  <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={`https://www.dmm.co.jp/litevideo/-/part/=/cid=${video.cid}/size=720_480/affi_id=mizutamari48-990/`}
                      className="absolute inset-0 h-full w-full border-0"
                      allowFullScreen
                      title={video.title}
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-2.5 px-1 text-[11px] leading-snug text-white/45 line-clamp-2">
                    {video.title}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-center text-[10px] text-white/25">
              ※ 18歳以上を対象としたアダルトコンテンツです
            </p>
          </section>
        )}

        {/* ── セクション4: 編集部レビュー ── */}
        {feature.review && (
          <section className="space-y-6">
            <SectionHeader icon={<BookOpen size={18} />} label="編集部レビュー" />
            <div className="relative rounded-2xl border border-[#d4af37]/20 bg-black/35 p-6 sm:p-8 backdrop-blur-sm">
              {/* 装飾ライン */}
              <div
                className="absolute left-0 top-0 h-full w-0.5 rounded-l-2xl"
                style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.1))' }}
              />
              <div
                className="prose-custom text-[13px] leading-relaxed text-white/65 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-[#d4af37] [&_h3]:mb-2 [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#d4af37]/80 [&_p]:mb-3 [&_p]:last:mb-0 [&_strong]:font-bold [&_strong]:text-white/85 [&_em]:italic [&_em]:text-white/50 [&_hr]:my-5 [&_hr]:border-[#d4af37]/15 [&_code]:rounded [&_code]:bg-[#d4af37]/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:text-[#d4af37]/80"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(feature.review) }}
              />
            </div>
          </section>
        )}

        {/* ── セクション5: SNS反響 ── */}
        <section className="space-y-6">
          <SectionHeader icon={<MessageCircle size={18} />} label="SNS反響" />
          {feature.tweets.length > 0 ? (
            <div className="space-y-4">
              {feature.tweets.map((tweet, i) => (
                <TweetEmbedBlock key={i} url={tweet.url} label={tweet.label} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#d4af37]/10 bg-black/20 py-10 text-center">
              <MessageCircle size={28} className="mb-3 text-[#d4af37]/20" />
              <p className="text-[12px] text-white/30">SNS投稿を随時追加予定です</p>
            </div>
          )}
        </section>

        {/* ── セクション6: タイムライン ── */}
        {feature.timeline.length > 0 && (
          <section className="space-y-6">
            <SectionHeader icon={<Clock size={18} />} label="注目ポイント タイムライン" />
            <div className="relative space-y-0 pl-8">
              {/* 縦線 */}
              <div
                className="absolute left-3 top-2 bottom-2 w-px"
                style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.05))' }}
              />

              {feature.timeline.map((item, i) => (
                <div key={i} className="relative pb-8 last:pb-0">
                  {/* ドット */}
                  <div
                    className={`absolute -left-5 top-1 h-3 w-3 rounded-full border-2 ${
                      item.isHighlight
                        ? 'border-[#d4af37] bg-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.7)]'
                        : 'border-[#d4af37]/40 bg-[#0a0800]'
                    }`}
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold tracking-wider text-[#d4af37]/50">{item.date}</span>
                      <span
                        className={`text-[13px] font-bold ${item.isHighlight ? 'text-[#d4af37]' : 'text-white/75'}`}
                      >
                        {item.label}
                      </span>
                    </div>
                    {item.note && (
                      <p className="text-[11px] leading-relaxed text-white/45">{item.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 関連導線 ── */}
        <section className="space-y-5">
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.3), transparent)' }}
          />
          <p className="text-center text-[11px] font-bold tracking-widest text-[#d4af37]/40 uppercase">
            Related
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RelatedLink
              href={
                heroArticle?.slug
                  ? `/verity/articles/${heroArticle.slug}`
                  : `/verity?tag=${encodeURIComponent(feature.actressTag)}`
              }
              label="最新記事を読む"
              sub={heroArticle ? fmtDate(heroArticle.published_at) : `${totalCount}件`}
            />
            {actressPageHref && (
              <RelatedLink
                href={actressPageHref}
                label="女優ページ"
                sub={feature.actressName}
              />
            )}
            <RelatedLink href="/verity/ranking" label="ランキング" sub="人気作品ランキング" />
            <RelatedLink href="/verity/features" label="特集一覧" sub="Spotlight" />
          </div>
        </section>

        {/* PR表示 */}
        <p className="text-center text-[10px] text-white/20">
          <span className="mr-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold border border-[#d4af37]/20 bg-[#d4af37]/8 text-[#d4af37]/40">
            PR
          </span>
          FANZAへのリンクはアフィリエイトリンクです
        </p>
      </div>
    </div>
  )
}

// ── 小コンポーネント ──────────────────────────────────────────────────────────

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#d4af37]/15 bg-black/35 p-4 text-center backdrop-blur-sm">
      <p className="text-[9px] font-bold tracking-wider text-[#d4af37]/50 uppercase">{label}</p>
      <p className="text-xl font-black text-[#d4af37]" style={{ textShadow: '0 0 20px rgba(212,175,55,0.4)' }}>
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-normal text-[#d4af37]/60">{unit}</span>}
      </p>
    </div>
  )
}

function RelatedLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-[#d4af37]/15 bg-black/30 p-4 transition-all hover:border-[#d4af37]/40 hover:bg-[#d4af37]/5"
    >
      <div>
        <p className="text-[12px] font-bold text-white/70 group-hover:text-[#d4af37] transition-colors">{label}</p>
        <p className="text-[10px] text-[#d4af37]/40">{sub}</p>
      </div>
      <ChevronRight size={14} className="text-[#d4af37]/30 group-hover:text-[#d4af37]/70 transition-colors" />
    </Link>
  )
}
