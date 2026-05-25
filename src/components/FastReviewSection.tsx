import { ExternalLink, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MarkdownBody } from '@/components/MarkdownBody'
import type { SnNewsWithActress } from '@/lib/types'

const SITE_KEY = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

function proxyImg(url: string) {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

async function fetchLatestReview(): Promise<SnNewsWithActress | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sn_news')
    .select(`
      *,
      actress:actresses!sn_news_actress_id_fkey(
        id, name, ruby, external_id, image_url
      )
    `)
    .eq('site_key', SITE_KEY)
    .eq('is_published', true)
    .eq('category', 'review')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[FastReviewSection] fetch error:', error.message)
    return null
  }
  if (!data) return null

  const galleryRaw = data.gallery_urls
  return {
    ...data,
    gallery_urls: Array.isArray(galleryRaw)
      ? (galleryRaw as unknown[]).filter((u): u is string => typeof u === 'string')
      : [],
    tags: data.tags ?? [],
    actress: data.actress ?? null,
  } as SnNewsWithActress
}

function publishedDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export async function FastReviewSection() {
  const review = await fetchLatestReview()
  if (!review) return null

  const imgSrc = review.thumbnail_url ? proxyImg(review.thumbnail_url) : null

  return (
    <section
      id="fast-review"
      className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]
                 shadow-[0_0_48px_rgba(226,0,116,0.12)]"
    >
      {/* Atmospheric background */}
      {imgSrc && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgSrc}
            alt=""
            className="h-full w-full scale-110 object-cover blur-3xl opacity-[0.06]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--surface)]/95 via-[var(--surface)]/85 to-[var(--magenta)]/6" />
        </div>
      )}

      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px
                      bg-gradient-to-r from-transparent via-[var(--magenta)]/40 to-transparent" />

      {/* Header badge */}
      <div className="relative flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <Zap size={13} className="shrink-0 text-[var(--magenta)]" />
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--magenta)]">
            最新作最速レビュー
          </span>
          <span className="text-[10px] tracking-wide text-[var(--text-muted)]">
            VERITYエディターによる速攻レポート
          </span>
        </div>
        <span className="ml-auto shrink-0 text-[9px] tracking-[0.2em] uppercase text-[var(--text-muted)]">
          Fast Review
        </span>
      </div>

      {/* Body: flex-col mobile / flex-row desktop */}
      <div className="relative flex flex-col gap-6 px-5 py-6
                      md:flex-row md:items-start md:gap-8 md:px-7 md:py-7">

        {/* Package image */}
        <div className="mx-auto w-full max-w-[220px] shrink-0 md:mx-0 md:w-[200px] md:max-w-none">
          {imgSrc ? (
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl
                            bg-[var(--surface-2)] shadow-[0_8px_32px_rgba(0,0,0,0.65)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt={review.title}
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            </div>
          ) : (
            <div className="aspect-[2/3] rounded-xl bg-[var(--surface-2)]" />
          )}

          {/* Actress name below image */}
          {review.actress && (
            <p className="mt-2.5 text-center text-[11px] tracking-widest text-[var(--text-muted)]">
              {review.actress.name}
            </p>
          )}
        </div>

        {/* Review content */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">

          {/* Title area */}
          <div className="space-y-1.5">
            <p className="text-[9px] tracking-[0.25em] uppercase text-[var(--text-muted)]">
              {publishedDate(review.published_at)}
            </p>
            <h2 className="text-[13px] font-semibold leading-relaxed text-[var(--text)]">
              {review.title}
            </h2>
          </div>

          {/* Tags */}
          {review.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {review.tags.slice(0, 6).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--magenta)]/25 bg-[var(--magenta)]/8
                             px-2 py-0.5 text-[9px] tracking-wider text-[var(--magenta)]/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Markdown review body */}
          <div className="max-h-[420px] overflow-y-auto pr-1 text-sm
                          [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
            <MarkdownBody content={review.content} className="text-[13px]" />
          </div>

          {/* CTA: affiliate_url 優先、なければ fanza_link にフォールバック */}
          {(review.affiliate_url || review.fanza_link) && (
            <a
              href={review.affiliate_url ?? review.fanza_link!}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full
                         border border-[var(--magenta)]/50 bg-[var(--magenta)]/10
                         px-6 py-2.5 text-sm font-bold text-[var(--magenta)]
                         transition-all duration-200
                         hover:bg-[var(--magenta)] hover:text-white
                         hover:shadow-[0_0_28px_rgba(226,0,116,0.55)]
                         active:scale-[0.97]"
            >
              この作品をチェックする
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
