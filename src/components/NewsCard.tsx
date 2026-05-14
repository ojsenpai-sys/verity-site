import Link from 'next/link'
import { Calendar, Tag } from 'lucide-react'
import type { SnNewsWithActress } from '@/lib/types'
function proxyUrl(url: string) {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

type Props = { news: SnNewsWithActress }

export function NewsCard({ news }: Props) {
  const href = `/news/${news.slug}`

  return (
    <article className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-[var(--magenta)]/60 hover:shadow-[0_0_28px_rgba(226,0,116,0.18)] hover:-translate-y-0.5">

      {/* サムネイル — pl.jpg は横長(800×538 ≈ 3:2) のため aspect-[3/2] を使用 */}
      <Link href={href} className="block relative w-full aspect-[3/2] overflow-hidden bg-[var(--surface-2)]">
        {news.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyUrl(news.thumbnail_url)}
            alt={news.title}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--text-muted)] text-xs">No Image</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/70 via-transparent to-transparent" />

        {/* カテゴリバッジ */}
        {news.category && (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--magenta)] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-[0_0_10px_rgba(226,0,116,0.5)]">
            {news.category}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4">

        {/* 女優チップ */}
        {news.actress && (
          <Link
            href={`/verity/actresses/${news.actress.external_id}`}
            className="inline-flex w-fit items-center rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--magenta)] hover:bg-[var(--magenta)]/25 transition-colors"
          >
            {news.actress.name}
          </Link>
        )}

        {/* タイトル */}
        <Link href={href}>
          <h2 className="font-semibold leading-snug text-[var(--text)] hover:text-[var(--magenta)] transition-colors line-clamp-2">
            {news.title}
          </h2>
        </Link>

        {/* サマリー */}
        {news.summary && (
          <p className="text-sm text-[var(--text-muted)] line-clamp-2 leading-relaxed">
            {news.summary}
          </p>
        )}

        {/* タグ */}
        {news.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {news.tags.slice(0, 3).map(tag => (
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

        {/* フッター：公開日 */}
        <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <Calendar size={11} />
            {formatDate(news.published_at)}
          </span>
          <Link href={href} className="text-[var(--magenta)] hover:underline">
            続きを読む →
          </Link>
        </div>
      </div>
    </article>
  )
}
