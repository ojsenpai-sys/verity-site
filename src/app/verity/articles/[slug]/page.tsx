export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, ExternalLink, Play, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AffiliateLinkBlock } from '@/components/AffiliateLink'
import { withAffiliate } from '@/lib/affiliate'
import type { Article, AffiliateLink } from '@/lib/types'

function proxyUrl(url: string) {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('title, summary, image_url, metadata, tags')
    .eq('slug', slug)
    .single()

  if (!data) return {}

  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

  // 女優名を metadata.actress から取得し description に含める
  const actresses: { name: string }[] = Array.isArray(data.metadata?.actress)
    ? (data.metadata.actress as { name: string }[])
    : []
  const actressNames = actresses.map(a => a.name).join('・')
  const descPrefix   = actressNames ? `${actressNames}出演。` : ''
  const description  = `${descPrefix}${data.summary ?? data.title}`

  const ogImage = data.image_url
    ? [{ url: data.image_url, width: 800, height: 538, alt: data.title }]
    : undefined

  return {
    title:       data.title,
    description,
    alternates:  { canonical: `${BASE}/articles/${slug}` },
    openGraph: {
      type:        'article',
      title:       data.title,
      description,
      images:      ogImage,
    },
    twitter: {
      title:       data.title,
      description,
      images:      data.image_url ? [data.image_url] : undefined,
    },
  }
}

type DmmInfoEntry = { id: number; name: string; ruby?: string }

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
      <dt className="w-20 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1.5">{children}</dd>
    </div>
  )
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!article) notFound()

  const { data: affiliateLinks } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('article_id', article.id)
    .order('display_order')

  const a = article as Article
  const links = (affiliateLinks as AffiliateLink[]) ?? []

  const isUpcoming = a.published_at ? new Date(a.published_at).getTime() > Date.now() : false
  // storedFanzaUrl または生 DMM URL を withAffiliate() 経由で統一
  const rawFanzaUrl =
    (typeof a.metadata?.affiliate_url === 'string' ? a.metadata.affiliate_url : null) ??
    (a.source === 'dmm' && typeof a.metadata?.url === 'string' ? (a.metadata.url as string) : null)
  const fanzaUrl = withAffiliate(rawFanzaUrl)
  const sampleMovieUrl = typeof a.metadata?.sample_movie_url === 'string' ? a.metadata.sample_movie_url : null

  const actresses = Array.isArray(a.metadata?.actress)
    ? (a.metadata!.actress as DmmInfoEntry[])
    : []
  const makers = Array.isArray(a.metadata?.maker)
    ? (a.metadata!.maker as DmmInfoEntry[])
    : []
  const labels = Array.isArray(a.metadata?.label)
    ? (a.metadata!.label as DmmInfoEntry[])
    : []
  const series = Array.isArray(a.metadata?.series)
    ? (a.metadata!.series as DmmInfoEntry[])
    : []
  const directors = Array.isArray(a.metadata?.director)
    ? (a.metadata!.director as DmmInfoEntry[])
    : []
  const review = a.metadata?.review as { count: number; average: string } | null | undefined
  const price = typeof a.metadata?.price === 'string' ? a.metadata.price : null

  const actressNameSet = new Set(actresses.map((ac) => ac.name))
  const genreTags = (a.tags ?? []).filter((t) => !actressNameSet.has(t))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
      >
        <ArrowLeft size={15} />
        ダッシュボードへ戻る
      </Link>

      {/* Category + source */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {a.category && (
          <span className="rounded-full bg-[var(--magenta)]/15 px-3 py-1 font-medium text-[var(--magenta)]">
            {a.category}
          </span>
        )}
        <span className="text-[var(--text-muted)]">{a.source}</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold leading-snug tracking-tight text-[var(--text)] sm:text-3xl">
        {a.title}
      </h1>

      {/* Full-package image — natural aspect ratio, no cropping */}
      {a.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyUrl(a.image_url)}
          alt={a.title}
          className="w-full h-auto rounded-xl bg-[var(--surface-2)]"
        />
      )}

      {/* CTAs */}
      {(fanzaUrl || sampleMovieUrl) && (
        <div className="flex flex-wrap justify-center gap-3">
          {fanzaUrl && (
            <a
              href={fanzaUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-full bg-[var(--magenta)] px-7 py-3 text-base font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.35)] hover:shadow-[0_0_36px_rgba(226,0,116,0.6)] hover:brightness-110 active:scale-95 transition-all"
            >
              {isUpcoming ? 'FANZAで予約する' : 'FANZAで購入する'}
              <ExternalLink size={15} />
            </a>
          )}
          {sampleMovieUrl && (
            <a
              href={sampleMovieUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-full border-2 border-[var(--magenta)] px-7 py-3 text-base font-bold text-[var(--magenta)] hover:bg-[var(--magenta)]/10 active:scale-95 transition-all"
            >
              <Play size={15} className="fill-[var(--magenta)]" />
              サンプル動画を見る
            </a>
          )}
        </div>
      )}

      {/* Metadata card */}
      <dl className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        {actresses.length > 0 && (
          <MetaRow label="女優">
            {actresses.map((act) => (
              <Link
                key={act.id}
                href={act.id > 0 ? `/actresses/dmm-actress-${act.id}` : `/?tag=${encodeURIComponent(act.name)}`}
                className="inline-flex items-center rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-2.5 py-0.5 text-[13px] font-semibold text-[var(--magenta)] hover:bg-[var(--magenta)]/25 transition-colors"
              >
                {act.name}
              </Link>
            ))}
          </MetaRow>
        )}

        {a.published_at && (
          <MetaRow label="発売日">
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]">
              <Calendar size={13} className="text-[var(--text-muted)]" />
              {new Date(a.published_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {isUpcoming && (
                <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                  予約受付中
                </span>
              )}
            </span>
          </MetaRow>
        )}

        {makers.length > 0 && (
          <MetaRow label="メーカー">
            {makers.map((m) => (
              <span key={m.id} className="text-sm text-[var(--text)]">{m.name}</span>
            ))}
          </MetaRow>
        )}

        {labels.length > 0 && (
          <MetaRow label="レーベル">
            {labels.map((l) => (
              <span key={l.id} className="text-sm text-[var(--text)]">{l.name}</span>
            ))}
          </MetaRow>
        )}

        {series.length > 0 && (
          <MetaRow label="シリーズ">
            {series.map((s) => (
              <span key={s.id} className="text-sm text-[var(--text)]">{s.name}</span>
            ))}
          </MetaRow>
        )}

        {directors.length > 0 && (
          <MetaRow label="監督">
            {directors.map((d) => (
              <span key={d.id} className="text-sm text-[var(--text)]">{d.name}</span>
            ))}
          </MetaRow>
        )}

        {genreTags.length > 0 && (
          <MetaRow label="ジャンル">
            {genreTags.map((tag) => (
              <Link
                key={tag}
                href={`/?tag=${encodeURIComponent(tag)}`}
                className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </MetaRow>
        )}

        {(review || price) && (
          <div className="flex flex-wrap items-center gap-6 border-t border-[var(--border)] pt-4">
            {review && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                <span className="font-semibold text-[var(--text)]">{review.average}</span>
                <span className="text-[var(--text-muted)]">({review.count.toLocaleString()}件)</span>
              </span>
            )}
            {price && (
              <span className="text-sm">
                <span className="font-bold text-[var(--text)]">¥{price}</span>
              </span>
            )}
          </div>
        )}
      </dl>

      {/* Summary */}
      {a.summary && (
        <p className="rounded-xl border-l-4 border-[var(--magenta)] bg-[var(--surface)] px-5 py-4 text-sm leading-relaxed text-[var(--text-muted)] italic">
          {a.summary}
        </p>
      )}

      {/* Body */}
      {a.content && (
        <div className="prose prose-invert prose-sm max-w-none text-[var(--text)] leading-relaxed space-y-4">
          {a.content.split('\n').map((line, i) =>
            line.trim() ? <p key={i}>{line}</p> : <br key={i} />
          )}
        </div>
      )}

      {/* Affiliate links from DB */}
      <AffiliateLinkBlock links={links} />

      {/* Raw metadata (dev only) */}
      {process.env.NODE_ENV === 'development' && a.metadata && (
        <details className="rounded-lg border border-[var(--border)] text-xs">
          <summary className="cursor-pointer px-4 py-2 text-[var(--text-muted)]">
            Raw metadata (dev only)
          </summary>
          <pre className="overflow-auto p-4 text-[var(--text-muted)]">
            {JSON.stringify(a.metadata, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
