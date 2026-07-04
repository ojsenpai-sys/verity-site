export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  ExternalLink,
  MapPin,
  CalendarDays,
  MessageCircle,
  Star,
  ChevronRight,
  Bot,
  Link2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { TweetEmbedBlock } from '@/components/TweetEmbedBlock'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import { getEvent, getEventTweets, resolveEventStatus } from '@/lib/events'
import type { EventActress } from '@/lib/events'
import type { Article } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

// ── generateMetadata ──────────────────────────────────────────────────────────

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const event = getEvent(slug)
  if (!event) return {}

  const names = event.actresses.map((a) => a.name).slice(0, 4).join('・')
  const title = `${event.shortName ?? event.name} ${event.location} 出演女優のX投稿・告知まとめ | VERITY`
  const description =
    `${event.name}（${event.venue ?? event.location}・${jpDate(event.startDate)}〜${jpDate(event.endDate)}）出演の` +
    `${names}ほか出演女優の出演告知・TRE関連投稿・最近のX投稿と関連作品を VERITY がまとめて紹介。`
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/verity/events/${slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
    },
  }
}

// ── データ取得 ────────────────────────────────────────────────────────────────

async function getArticlesByTag(tag: string, limit = 6): Promise<Article[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, slug, image_url, metadata, published_at, tags')
    .eq('is_active', true)
    .contains('tags', [tag])
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) console.error('[events/detail works]', error.message)
  return (data as Article[]) ?? []
}

/** 女優名から external_id を解決（内部女優ページリンク用）。見つからなければ null。 */
async function getActressExternalId(name: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('external_id')
    .eq('name', name)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return (data?.external_id as string | undefined) ?? null
}

type ResolvedActress = EventActress & {
  externalId?: string
  works: Article[]
}

// ── 画像/URL ユーティリティ ──────────────────────────────────────────────────

function proxiedJacket(article: Article): string {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
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

function jpDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: '開催予定',
  live: '開催中',
  ended: '開催終了',
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function EventDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const event = getEvent(slug)
  if (!event) notFound()

  const isOverseas = await getIsOverseasUser()
  const status = resolveEventStatus(event)
  const tweets = getEventTweets(slug)

  // 出演女優ごとに external_id 解決＋関連作品取得を並列実行
  const resolvedActresses: ResolvedActress[] = await Promise.all(
    event.actresses.map(async (a): Promise<ResolvedActress> => {
      const [externalId, works] = await Promise.all([
        a.externalId ? Promise.resolve(a.externalId) : getActressExternalId(a.name),
        getArticlesByTag(a.name, 4),
      ])
      return { ...a, externalId: externalId ?? undefined, works }
    }),
  )

  // screenName → 女優（投稿タイムラインの女優導線用）
  const byScreenName = new Map(resolvedActresses.map((a) => [a.screenName.toLowerCase(), a]))

  // ── JSON-LD（Next 16 では metadata.other['script:ld+json'] は <meta> 化して機能しないため
  //    ここでインライン <script type="application/ld+json"> として出力する） ──
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: {
        '@type': 'Place',
        name: event.venue ?? event.location,
        address: event.location,
      },
      performer: event.actresses.map((a) => ({ '@type': 'Person', name: a.name })),
      description: event.description,
      url: `${BASE}/verity/events/${slug}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'VERITY', item: `${BASE}/verity` },
        { '@type': 'ListItem', position: 2, name: 'Events', item: `${BASE}/verity/events` },
        { '@type': 'ListItem', position: 3, name: event.shortName ?? event.name, item: `${BASE}/verity/events/${slug}` },
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-[#0a0800]">
      {/* JSON-LD（<script>） — dangerouslySetInnerHTML で '<' をエスケープ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/* ══ ヒーロー: イベント概要 ══ */}
      <div className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 30% 20%, rgba(212,175,55,0.14) 0%, transparent 70%)',
          }}
        />
        <div className="relative mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
          {/* パンくず */}
          <nav className="mb-5 flex items-center gap-1 text-[10px] text-[#d4af37]/40">
            <Link href="/verity" className="hover:text-[#d4af37]/70 transition-colors">VERITY</Link>
            <ChevronRight size={10} />
            <Link href="/verity/events" className="hover:text-[#d4af37]/70 transition-colors">Events</Link>
            <ChevronRight size={10} />
            <span className="text-[#d4af37]/60">{event.shortName ?? event.name}</span>
          </nav>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-[#d4af37]">
              <Sparkles size={10} />
              VERITY Event Hub
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold tracking-wider ${
                status === 'live'
                  ? 'border border-red-500/50 bg-red-500/15 text-red-300'
                  : status === 'upcoming'
                  ? 'border border-sky-500/40 bg-sky-500/10 text-sky-300'
                  : 'border border-white/15 bg-white/5 text-white/40'
              }`}
            >
              {status === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
              {STATUS_LABEL[status]}
            </span>
          </div>

          <h1
            className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-[#d4af37]"
            style={{ textShadow: '0 0 56px rgba(212,175,55,0.45)' }}
          >
            {event.name}
          </h1>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={13} className="text-[#d4af37]/60" />
              {event.location}{event.venue ? `（${event.venue}）` : ''}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={13} className="text-[#d4af37]/60" />
              {jpDate(event.startDate)}〜{jpDate(event.endDate)}
            </span>
          </div>

          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-white/50">
            {event.description}
          </p>

          {event.links.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {event.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/25 bg-[#d4af37]/8 px-3.5 py-1.5 text-[11px] font-bold text-[#d4af37]/80 transition-all hover:border-[#d4af37]/60 hover:bg-[#d4af37]/15"
                >
                  <Link2 size={11} />
                  {l.label}
                  <ExternalLink size={9} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-16 px-4 pb-16">

        {/* ══ AI要約枠 ══ */}
        {event.aiSummary && (
          <section className="space-y-4">
            <SectionHeader icon={<Bot size={18} />} label={`AIまとめ`} />
            <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-gradient-to-br from-[#d4af37]/[0.06] to-black/40 p-5 sm:p-6 backdrop-blur-sm">
              <div
                className="absolute left-0 top-0 h-full w-0.5"
                style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.1))' }}
              />
              <p className="text-[13px] leading-relaxed text-white/70">{event.aiSummary}</p>
              <p className="mt-3 text-[10px] text-white/25">
                ※ 現在は編集部による手動要約です。将来的にX投稿からの自動生成に対応予定。
              </p>
            </div>
          </section>
        )}

        {/* ══ 出演女優のX投稿（告知・関連・最近） ══ */}
        <section className="space-y-6">
          <SectionHeader icon={<MessageCircle size={18} />} label="出演女優のX投稿まとめ" count={tweets.length || undefined} />
          <div className="-mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/45 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-bold text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              随時更新中
            </span>
            <p className="text-[11px] leading-relaxed text-white/40">
              TRE2026関連の投稿（
              <span className="rounded border border-[#d4af37]/25 bg-[#d4af37]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#d4af37]/70">TRE</span>
              バッジ）を優先表示。会場からの最新投稿は順次追加します。
            </p>
          </div>
          {tweets.length > 0 ? (
            <div className="space-y-5">
              {tweets.map((t, i) => {
                const actress = byScreenName.get(t.screenName.toLowerCase())
                const displayName = actress?.name ?? t.name ?? `@${t.screenName}`
                const actressHref = actress?.externalId
                  ? `/verity/actresses/${actress.externalId}`
                  : null
                return (
                  <div key={i} className="space-y-2">
                    {/* 女優導線ヘッダー */}
                    <div className="flex items-center gap-2 text-[12px]">
                      {actressHref ? (
                        <Link
                          href={actressHref}
                          className="inline-flex items-center gap-1.5 font-bold text-[#d4af37] transition-colors hover:text-[#d4af37]/70"
                        >
                          {displayName}
                          <ChevronRight size={12} />
                        </Link>
                      ) : (
                        <a
                          href={`https://x.com/${t.screenName}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-bold text-white/70 transition-colors hover:text-[#d4af37]"
                        >
                          {displayName}
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {t.eventRelated && (
                        <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-0.5 text-[9px] font-bold text-[#d4af37]/70">
                          {event.shortName ?? 'EVENT'}
                        </span>
                      )}
                      {t.postedAt && (
                        <span className="text-[10px] text-white/30">{fmtDateTime(t.postedAt)}</span>
                      )}
                    </div>
                    <TweetEmbedBlock url={t.url} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#d4af37]/10 bg-black/20 py-10 text-center">
              <MessageCircle size={28} className="mb-3 text-[#d4af37]/20" />
              <p className="text-[12px] text-white/30">投稿を随時追加予定です</p>
            </div>
          )}
        </section>

        {/* ══ 出演女優 × 関連作品（女優ごと） ══ */}
        <section className="space-y-8">
          <SectionHeader icon={<Star size={18} />} label="出演女優と関連作品" count={resolvedActresses.length} />
          {resolvedActresses.map((a) => (
            <div key={a.screenName} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                {/* SEO: 女優名 × イベント名 の h2 */}
                <h2 className="text-base font-bold text-white/85">
                  {a.name}
                  <span className="ml-2 text-[11px] font-normal text-[#d4af37]/50">
                    × {event.shortName ?? event.name}
                  </span>
                </h2>
                {a.externalId ? (
                  <Link
                    href={`/verity/actresses/${a.externalId}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[#d4af37]/25 bg-[#d4af37]/8 px-3 py-1 text-[10px] font-bold text-[#d4af37]/80 transition-all hover:border-[#d4af37]/60"
                  >
                    女優ページ
                    <ChevronRight size={11} />
                  </Link>
                ) : (
                  <a
                    href={`https://x.com/${a.screenName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold text-white/50 transition-all hover:text-[#d4af37]"
                  >
                    @{a.screenName}
                    <ExternalLink size={9} />
                  </a>
                )}
              </div>

              {a.works.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {a.works.map((article) => (
                    <WorkCard
                      key={article.id}
                      article={article}
                      fanzaUrl={affiliateUrl(article, isOverseas)}
                      eventSlug={slug}
                      screenName={a.screenName}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-[11px] text-white/30">
                  関連作品は準備中です
                </p>
              )}
            </div>
          ))}
        </section>

        {/* ══ 関連導線 ══ */}
        <section className="space-y-5">
          <div
            className="h-px w-full"
            style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.3), transparent)' }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <RelatedLink href="/verity/ranking" label="ランキング" sub="人気作品ランキング" />
            <RelatedLink href="/verity/actresses" label="女優一覧" sub="出演女優を探す" />
            <RelatedLink href="/verity/events" label="イベント一覧" sub="Event Hub" />
          </div>
        </section>

        <p className="text-center text-[10px] text-white/20">
          <span className="mr-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold border border-[#d4af37]/20 bg-[#d4af37]/8 text-[#d4af37]/40">
            PR
          </span>
          FANZAへのリンクはアフィリエイトリンクです / X投稿は各投稿者に帰属します
        </p>
      </div>
    </div>
  )
}

// ── 小コンポーネント ──────────────────────────────────────────────────────────

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

function WorkCard({
  article,
  fanzaUrl,
  eventSlug,
  screenName,
}: {
  article: Article
  fanzaUrl: string | null
  eventSlug: string
  screenName: string
}) {
  const imgSrc = proxiedJacket(article)
  const upcoming = !!article.published_at && new Date(article.published_at).getTime() > Date.now()
  // position 命名規則: event_<slug>_actress_work（イベント経由送客を既存 position と区別）
  const position = `event_${eventSlug}_actress_work`

  const inner = (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[#d4af37]/20 bg-black/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-[0_0_28px_rgba(212,175,55,0.18)]">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#0d0a00]">
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
      </div>
      <div className="flex flex-col gap-2 p-3">
        <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85">{article.title}</p>
        {fanzaUrl && (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position={position}
            meta={{ eventSlug, screenName }}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#b8960c] to-[#d4af37] py-2 text-[10px] font-bold text-[#0a0800] transition-all hover:brightness-110"
          >
            {upcoming ? '今すぐ予約' : 'FANZAで観る'}
            <ExternalLink size={9} />
          </FanzaLink>
        )}
      </div>
    </article>
  )

  return fanzaUrl ? (
    <FanzaLink
      href={fanzaUrl}
      targetId={article.external_id}
      position={`event_${eventSlug}_actress_work_image`}
      meta={{ eventSlug, screenName }}
      className="contents"
    >
      {inner}
    </FanzaLink>
  ) : (
    inner
  )
}

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

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
