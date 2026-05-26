import Link from 'next/link'
import { Tag, Clock, ExternalLink } from 'lucide-react'
import { NowPrinting } from './NowPrinting'
import { ProxiedImage } from './ProxiedImage'
import { cidToCdnUrl, isBadImageUrl } from '@/lib/cidUtils'
import { withAffiliate } from '@/lib/affiliate'
import type { Article } from '@/lib/types'

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

/** metadata.url が /dc/doujin/ を含む場合、cid を抽出してFANZA書影URLを返す */
function doujinCoverUrl(metaUrl: string | null | undefined): string | null {
  if (!metaUrl?.includes('/dc/doujin/')) return null
  const m = metaUrl.match(/\/cid=([^/?]+)/)
  if (!m) return null
  const cid = m[1]
  return `https://pics.dmm.co.jp/digital/comic/${cid}/${cid}pl.jpg`
}

/**
 * image_url が null / 空 / 'NOW PRINTING' の場合:
 *   1. 同人コミックなら metadata.url から cid を抽出して FANZA 書影 URL を生成
 *   2. それ以外は external_id（CID）から CDN URL を再構築
 *   いずれも無ければ null → NowPrinting を表示。
 */
function effectiveImageUrl(article: Article): string | null {
  if (!isBadImageUrl(article.image_url)) return article.image_url!
  const doujin = doujinCoverUrl(article.metadata?.url as string | null)
  if (doujin) return doujin
  const cid = article.external_id as string | null | undefined
  return cid ? cidToCdnUrl(cid, 'pl') : null
}

type MetaActress = { id: number; name: string }

type ArticleCardProps = {
  article: Article
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return '1時間以内'
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

function isNew(dateStr: string | null): boolean {
  if (!dateStr) return false
  const diff = Date.now() - new Date(dateStr).getTime()
  return diff > 0 && diff < 7 * 24 * 3_600_000
}

function isUpcoming(dateStr: string | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr).getTime() > Date.now()
}

function actressHref(a: MetaActress): string {
  return a.id > 0 ? `/actresses/dmm-actress-${a.id}` : `/?tag=${encodeURIComponent(a.name)}`
}

export function ArticleCard({ article }: ArticleCardProps) {
  // Preserve full { id, name } objects for linking to actress pages
  const actressMeta: MetaActress[] = Array.isArray(article.metadata?.actress)
    ? (article.metadata!.actress as MetaActress[])
    : article.metadata?.actress_name
    ? [{ id: 0, name: String(article.metadata.actress_name) }]
    : []

  const actressNameSet = new Set(actressMeta.map((a) => a.name))
  const displayActresses = actressMeta.slice(0, 3)
  const extraCount = actressMeta.length - displayActresses.length

  const rawAffiliateUrl =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string' && article.source === 'dmm'
      ? (article.metadata.url as string)
      : null

  const affiliateUrl = withAffiliate(rawAffiliateUrl)
  const upcoming = isUpcoming(article.published_at)

  // Precompute badge flags to avoid repeated IIFE closures
  const metaUrl = typeof article.metadata?.url === 'string' ? (article.metadata.url as string) : null
  const isDoujin = metaUrl !== null && metaUrl.includes('/dc/doujin/')
  const floor = typeof article.metadata?.floor === 'string' ? article.metadata.floor : null
  const isDvd = !isDoujin && (floor === 'dvd' || (metaUrl !== null && metaUrl.includes('/mono/dvd/')))
  const isDigital = !isDoujin && !isDvd && (floor === 'videoa' || (metaUrl !== null && metaUrl.includes('/digital/')))

  const imgUrl = effectiveImageUrl(article)

  const imageContent = imgUrl ? (
    <>
      <ProxiedImage
        src={proxyUrl(imgUrl)}
        alt={article.title}
        className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-200 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />
    </>
  ) : (
    <NowPrinting />
  )

  const imageBadges = (
    <>
      {upcoming && (
        <span className="absolute left-0 top-3 rounded-r-full bg-sky-600 px-3 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-[0_0_10px_rgba(2,132,199,0.5)]">
          予約
        </span>
      )}
      {isNew(article.published_at) && (
        <span className="absolute left-0 top-3 rounded-r-full bg-[var(--magenta)] px-3 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-[0_0_10px_rgba(226,0,116,0.5)]">
          NEW
        </span>
      )}
      {isDoujin && (
        <span className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2.5 py-0.5 text-[9px] font-bold tracking-wide text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]">
          同人コミック
        </span>
      )}
      {(isDvd || isDigital) && (
        <span className={[
          'absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide',
          isDvd
            ? 'bg-orange-500/90 text-white shadow-[0_0_8px_rgba(249,115,22,0.5)]'
            : 'bg-sky-500/90 text-white shadow-[0_0_8px_rgba(14,165,233,0.5)]',
        ].join(' ')}>
          {isDvd ? 'DVD' : '動画配信'}
        </span>
      )}
    </>
  )

  const imageWrapperClass = "relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"

  return (
    <article className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-[var(--magenta)]/60 hover:shadow-[0_0_28px_rgba(226,0,116,0.18)] hover:-translate-y-0.5">
      {/* Image — clicking goes directly to FANZA affiliate */}
      {affiliateUrl ? (
        <a
          href={affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className={imageWrapperClass}
        >
          {imageContent}
          {imageBadges}
        </a>
      ) : (
        <div className={imageWrapperClass}>
          {imageContent}
          {imageBadges}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        {/* Actress chips — link to actress page */}
        {displayActresses.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {displayActresses.map((act) => (
              <Link
                key={act.id || act.name}
                href={actressHref(act)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--magenta)] hover:bg-[var(--magenta)]/25 transition-colors"
              >
                {act.name}
              </Link>
            ))}
            {extraCount > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">+{extraCount}</span>
            )}
          </div>
        )}

        {/* Category badge + source */}
        <div className="flex items-center gap-2 text-xs">
          {article.category && (
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 font-medium text-[var(--magenta)]">
              {article.category}
            </span>
          )}
          <span className="text-[var(--text-muted)]">{article.source}</span>
        </div>

        {/* Title */}
        <Link href={`/articles/${article.slug}`} className="group/title">
          <h2 className="font-semibold leading-snug text-[var(--text)] group-hover/title:text-[var(--magenta)] transition-colors line-clamp-2">
            {article.title}
          </h2>
        </Link>

        {/* Summary */}
        {article.summary && (
          <p className="text-sm text-[var(--text-muted)] line-clamp-2 leading-relaxed">
            {article.summary}
          </p>
        )}

        {/* Genre tags (actress names excluded) */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags
              .filter((t) => !actressNameSet.has(t))
              .slice(0, 4)
              .map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]"
                >
                  <Tag size={9} />
                  {tag}
                </span>
              ))}
          </div>
        )}

        {/* CTA + Footer */}
        <div className="mt-auto space-y-3">
          {affiliateUrl && (
            <a
              href={affiliateUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-pink-600 to-rose-600 px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:from-pink-500 hover:to-rose-500 hover:shadow-[0_0_16px_rgba(225,29,72,0.45)] active:scale-[0.97]"
            >
              {upcoming ? 'DMMで今すぐ予約（特典付き）' : 'DMMでサンプル動画を試聴'}
              <ExternalLink size={13} />
            </a>
          )}
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {timeAgo(article.published_at)}
            </span>
            <Link
              href={`/articles/${article.slug}`}
              className="flex items-center gap-1 text-[var(--magenta)] hover:underline"
            >
              詳細 <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
