'use client'

import { useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { SnNewsWithActress } from '@/lib/types'
import { NewsCard } from './NewsCard'
import { fetchNewsList } from '@/app/verity/actions/news'

const LOAD_MORE_LIMIT = 20

type Props = {
  initialItems:   SnNewsWithActress[]
  initialHasMore: boolean
}

export function NewsListClient({ initialItems, initialHasMore }: Props) {
  const [items,   setItems]   = useState(initialItems)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const { items: next, hasMore: more } = await fetchNewsList(LOAD_MORE_LIMIT, items.length)
      setItems(prev => [...prev, ...next])
      setHasMore(more)
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, items.length])

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-[var(--text-muted)]">
        <span className="text-4xl">📰</span>
        <p className="text-sm">まだニュースがありません</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(news => (
          <NewsCard key={news.id} news={news} />
        ))}

        {/* スケルトン（ローディング中） */}
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`sk-${i}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden animate-pulse"
          >
            <div className="aspect-video bg-[var(--surface-2)]" />
            <div className="p-4 space-y-3">
              <div className="h-3 w-1/3 rounded bg-[var(--surface-2)]" />
              <div className="h-4 w-full rounded bg-[var(--surface-2)]" />
              <div className="h-4 w-2/3 rounded bg-[var(--surface-2)]" />
            </div>
          </div>
        ))}
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            className="group relative inline-flex items-center gap-2.5 rounded-full border border-[var(--magenta)]/40 bg-[var(--surface)] px-8 py-3 text-sm font-semibold text-[var(--magenta)] shadow-[0_0_20px_rgba(226,0,116,0.1)] transition-all hover:border-[var(--magenta)] hover:shadow-[0_0_32px_rgba(226,0,116,0.3)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)] shadow-[0_0_6px_rgba(226,0,116,0.8)]" />
            もっと見る
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)] shadow-[0_0_6px_rgba(226,0,116,0.8)]" />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-[var(--magenta)]" />
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <p className="text-center text-xs text-[var(--text-muted)]">
          すべての記事を表示しました
        </p>
      )}
    </div>
  )
}
