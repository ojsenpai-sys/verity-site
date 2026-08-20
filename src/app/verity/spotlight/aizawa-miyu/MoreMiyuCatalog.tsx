'use client'

// MORE MIYU — DB動的カタログ（フィルタ切替 + もっと見る）。
// 初期48件はSSRで渡し、フィルタ切替・追加読み込みは既存の集計ロジックを共有する
// API route (/verity/api/spotlight/aizawa-miyu-catalog) を呼ぶ（dedupeロジックの二重管理なし）。
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { WorkCard, type WorkCardArticle } from './WorkCard'
import { CATALOG_FILTERS, type CatalogFilter, type CatalogItem } from '@/lib/actressSpotlightCatalog'

const PAGE_SIZE = 48

function toWorkCardArticle(item: CatalogItem): WorkCardArticle {
  return {
    external_id: item.external_id,
    title: item.title,
    slug: item.slug,
    image_url: item.image_url,
    published_at: item.published_at,
    metadata: item.metadata,
    tags: item.tags,
  }
}

export function MoreMiyuCatalog({
  initialItems,
  initialTotal,
  initialHasMore,
  isOverseas,
}: {
  initialItems: CatalogItem[]
  initialTotal: number
  initialHasMore: boolean
  isOverseas: boolean
}) {
  const [filter, setFilter] = useState<CatalogFilter>('all')
  const [items, setItems] = useState(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function fetchPage(nextFilter: CatalogFilter, offset: number) {
    setLoading(true)
    try {
      const res = await fetch(
        `/verity/api/spotlight/aizawa-miyu-catalog?filter=${nextFilter}&offset=${offset}&limit=${PAGE_SIZE}`,
      )
      const data = (await res.json()) as { items: CatalogItem[]; total: number; hasMore: boolean }
      if (offset === 0) setItems(data.items)
      else setItems((prev) => [...prev, ...data.items])
      setTotal(data.total)
      setHasMore(data.hasMore)
    } catch (e) {
      console.error('[MoreMiyuCatalog] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleFilterClick(key: CatalogFilter) {
    if (key === filter || loading) return
    setFilter(key)
    void fetchPage(key, 0)
  }

  function handleLoadMore() {
    if (loading) return
    void fetchPage(filter, items.length)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {CATALOG_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => handleFilterClick(f.key)}
            className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
              filter === f.key
                ? 'border-fuchsia-400 bg-fuchsia-600/25 text-fuchsia-200'
                : 'border-white/15 text-white/50 hover:border-fuchsia-400/40 hover:text-white/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-white/35">{total}作品中 {items.length}作品を表示</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <WorkCard
            key={item.external_id}
            article={toWorkCardArticle(item)}
            isOverseas={isOverseas}
            position="spotlight_aizawa_miyu_image"
            sectionBadge="more_miyu"
          />
        ))}
      </div>

      {items.length === 0 && !loading && (
        <p className="py-8 text-center text-[12px] text-white/40">該当する作品がありません。</p>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/40 bg-fuchsia-600/10 px-6 py-2.5 text-[12px] font-bold text-fuchsia-200 transition-all hover:border-fuchsia-400/70 hover:bg-fuchsia-600/20 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            もっと見る
          </button>
        </div>
      )}
    </div>
  )
}
