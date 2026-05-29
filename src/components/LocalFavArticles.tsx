'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, ExternalLink } from 'lucide-react'

const FAV_ARTICLES_KEY = 'verity_fav_articles'

function readSlugs(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_ARTICLES_KEY) ?? '[]') } catch { return [] }
}

function removeSlug(slug: string) {
  const current = readSlugs()
  localStorage.setItem(FAV_ARTICLES_KEY, JSON.stringify(current.filter(s => s !== slug)))
  window.dispatchEvent(new Event('verity:fav-changed'))
}

export function LocalFavArticles() {
  const [slugs, setSlugs] = useState<string[]>([])

  useEffect(() => {
    setSlugs(readSlugs())

    function sync() { setSlugs(readSlugs()) }
    window.addEventListener('verity:fav-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('verity:fav-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (slugs.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Heart size={14} style={{ fill: '#E20074', color: '#E20074' }} />
        <h2 className="text-sm font-bold text-[var(--text)]">お気に入り記事・作品</h2>
        <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
          {slugs.length}件
        </span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
        {slugs.map(slug => {
          // Slugs may be: news slugs (from sn_news) or article external_ids (fallback)
          const isNewsSlug = !/^[0-9a-f]{8}-[0-9a-f]{4}/.test(slug) && !slug.startsWith('cid')
          const href = isNewsSlug ? `/verity/news/${slug}` : `/verity/articles/${slug}`

          return (
            <div key={slug} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={href}
                className="flex-1 min-w-0 flex items-center gap-2 text-sm text-[var(--text)] hover:text-[var(--magenta)] transition-colors"
              >
                <ExternalLink size={12} className="shrink-0 text-[var(--text-muted)]" />
                <span className="truncate font-mono text-xs text-[var(--text-muted)]">{slug}</span>
              </Link>
              <button
                onClick={() => removeSlug(slug)}
                className="shrink-0 rounded-full p-1.5 text-[var(--text-muted)] hover:text-[var(--magenta)] hover:bg-[var(--magenta)]/10 transition-all"
                aria-label="お気に入りから削除"
              >
                <Heart size={12} style={{ fill: 'currentColor' }} />
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        * このデバイスにローカル保存されています
      </p>
    </section>
  )
}
