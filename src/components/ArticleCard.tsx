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

/**
 * image_url が null / 空 / 'NOW PRINTING' の場合、external_id（CID）から
 * CDN URL を再構築する。それも無ければ null を返す → NowPrinting を表示。
 */
function effectiveImageUrl(article: Article): string | null {
  if (!isBadImageUrl(article.image_url)) return article.image_url!
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

  return (
    <article className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-[var(--magenta)]/60 hover:shadow-[0_0_28px_rgba(226,0,116,0.18)] hover:-translate-y-0.5">
      {/* Image — proxy serves pl.jpg first; object-right crops to front-cover (right half) */}
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
        {(() => {
          const imgUrl = effectiveImageUrl(article)
          return imgUrl ? (
            <>
              <ProxiedImage
                src={proxyUrl(imgUrl)}
                alt={article.title}
                className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />
            </>
          ) : (
            <NowPrinting />
          )
        })()}

        {isUpcoming(article.published_at) && (
          <span className="absolute left-0 top-3 rounded-r-full bg-sky-600 px-3 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-[0_0_10px_rgba(2,132,199,0.5)]">
            予約
          </span>
        )}
        {isNew(article.published_at) && (
          <span className="absolute left-0 top-3 rounded-r-full bg-[var(--magenta)] px-3 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-[0_0_10px_rgba(226,0,116,0.5)]">
            NEW
          </span>
        )}
      </div>

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

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {timeAgo(article.published_at)}
          </span>
          <div className="flex items-center gap-3">
            {affiliateUrl && (
              <span className="flex items-center gap-1">
                <a
                  href={affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
                >
                  FANZA <ExternalLink size={11} />
                </a>
                <span className="rounded px-1 py-px text-[11px] font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
                  PR
                </span>
              </span>
            )}
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
