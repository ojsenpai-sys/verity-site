'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, User, Film, X, ChevronRight, Loader2 } from 'lucide-react'

type ActressSuggestion = {
  id: string
  external_id: string
  name: string
  ruby: string | null
  article_count: number
  is_active: boolean
}

// ── サジェストドロップダウン ──────────────────────────────────────────────────
function SuggestionDropdown({
  items,
  loading,
  query,
  onSelect,
  onSearchAll,
  onViewAll,
}: {
  items: ActressSuggestion[]
  loading: boolean
  query: string
  onSelect: (item: ActressSuggestion) => void
  onSearchAll: () => void
  onViewAll: (item: ActressSuggestion) => void
}) {
  if (!query) return null
  if (!loading && items.length === 0) return null

  // 作品数11件超の最上位候補（全作品リンク表示用）
  const topWithWorks = items.find((item) => item.article_count > 11) ?? null

  return (
    <div
      className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-[#d4af37]/30 bg-[#0d0b00] shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(212,175,55,0.08)]"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-3 text-[11px] text-[#d4af37]/50">
          <Loader2 size={12} className="animate-spin" />
          検索中...
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#d4af37]/10"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#d4af37]/25 bg-[#d4af37]/8">
                  <User size={10} style={{ color: '#d4af37' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-bold text-white/90 truncate">{item.name}</p>
                    {!item.is_active && (
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-bold text-white/40">
                        引退
                      </span>
                    )}
                  </div>
                  {item.ruby && (
                    <p className="text-[9px] text-[#d4af37]/45 truncate">{item.ruby}</p>
                  )}
                </div>
                <ChevronRight size={11} className="ml-auto shrink-0 text-[#d4af37]/40" />
              </button>
            </li>
          ))}

          {/* 全作品リンク — 作品数11件超の最上位候補がある場合 */}
          {topWithWorks && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onViewAll(topWithWorks) }}
                className="flex w-full items-center gap-2 border-t border-[#d4af37]/15 px-4 py-2.5 text-left transition-colors hover:bg-[#d4af37]/8"
              >
                <span className="text-[11px]">🔍</span>
                <span className="flex-1 text-[11px] font-bold text-[#d4af37]/80 hover:text-[#d4af37]">
                  {topWithWorks.name} の全作品を見る
                </span>
                <span className="shrink-0 rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-0.5 text-[9px] font-bold text-[#d4af37]">
                  計{topWithWorks.article_count.toLocaleString()}件
                </span>
              </button>
            </li>
          )}

          <li>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onSearchAll() }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[#d4af37]/15 px-4 py-2.5 text-[11px] font-bold text-[#d4af37]/60 transition-colors hover:bg-[#d4af37]/8 hover:text-[#d4af37]"
            >
              「{query}」で全女優を検索
              <ChevronRight size={10} />
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

// ── メインコンポーネント ─────────────────────────────────────────────────────
export function TopSearchBar() {
  const router = useRouter()

  // ── 女優検索 state ──
  const [actressQuery, setActressQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ActressSuggestion[]>([])
  const [sugLoading, setSugLoading] = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const actressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actressInputRef = useRef<HTMLInputElement>(null)

  // ── 作品検索 state ──
  const [articleQuery, setArticleQuery] = useState('')

  // ── 女優サジェスト取得 ──
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return }
    setSugLoading(true)
    try {
      const res = await fetch(`/verity/api/actresses?q=${encodeURIComponent(q.trim())}&limit=6`)
      if (res.ok) setSuggestions(await res.json())
    } finally {
      setSugLoading(false)
    }
  }, [])

  useEffect(() => {
    if (actressTimerRef.current) clearTimeout(actressTimerRef.current)
    if (!actressQuery.trim()) { setSuggestions([]); setSugLoading(false); return }
    setSugLoading(true)
    actressTimerRef.current = setTimeout(() => fetchSuggestions(actressQuery), 220)
    return () => { if (actressTimerRef.current) clearTimeout(actressTimerRef.current) }
  }, [actressQuery, fetchSuggestions])

  // ── ハンドラー ──
  function handleActressSelect(item: ActressSuggestion) {
    setActressQuery(item.name)
    setShowDrop(false)
    router.push(`/verity/actresses/${item.external_id}`)
  }

  function handleActressSearchAll() {
    setShowDrop(false)
    router.push(`/verity/actresses?q=${encodeURIComponent(actressQuery.trim())}`)
  }

  function handleViewAllWorks(item: ActressSuggestion) {
    setActressQuery(item.name)
    setShowDrop(false)
    router.push(`/verity/actresses/${item.external_id}`)
  }

  function handleActressKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      setShowDrop(false)
      if (actressQuery.trim()) {
        if (suggestions.length === 1) {
          router.push(`/verity/actresses/${suggestions[0].external_id}`)
        } else {
          router.push(`/verity/actresses?q=${encodeURIComponent(actressQuery.trim())}`)
        }
      }
    }
    if (e.key === 'Escape') setShowDrop(false)
  }

  function handleArticleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (articleQuery.trim()) {
        router.push(`/verity/search?q=${encodeURIComponent(articleQuery.trim())}`)
      }
    }
  }

  return (
    <div className="w-full rounded-2xl border border-[#d4af37]/20 bg-gradient-to-b from-[#0d0b01] to-[#0a0800] px-4 py-4 sm:px-6 sm:py-5 shadow-[0_0_30px_rgba(212,175,55,0.06)]">
      {/* ラベル行 */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="h-4 w-0.5 rounded-full"
          style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.15))' }}
        />
        <span className="text-[10px] font-black tracking-[0.2em] uppercase text-[#d4af37]/60">
          Quick Search
        </span>
      </div>

      {/* 2カラム入力群 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

        {/* ── 女優名で検索 ── */}
        <div className="relative">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#d4af37]/55">
            <User size={10} />
            女優名で検索
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Search size={13} style={{ color: 'rgba(212,175,55,0.5)' }} />
            </div>
            <input
              ref={actressInputRef}
              type="search"
              value={actressQuery}
              placeholder="例：石川澪、小野六花…"
              autoComplete="off"
              onChange={(e) => {
                setActressQuery(e.target.value)
                setShowDrop(true)
              }}
              onFocus={() => setShowDrop(true)}
              onBlur={() => setTimeout(() => setShowDrop(false), 120)}
              onKeyDown={handleActressKeyDown}
              className="w-full rounded-xl border border-[#d4af37]/25 bg-[#080700] py-2.5 pl-9 pr-8 text-sm text-white/90 placeholder:text-white/20 outline-none transition-all duration-150 focus:border-[#d4af37]/60 focus:shadow-[0_0_0_2px_rgba(212,175,55,0.12)]"
            />
            {actressQuery && (
              <button
                type="button"
                onClick={() => { setActressQuery(''); setSuggestions([]); actressInputRef.current?.focus() }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white/60"
                aria-label="クリア"
              >
                <X size={12} />
              </button>
            )}
            {showDrop && (
              <SuggestionDropdown
                items={suggestions}
                loading={sugLoading}
                query={actressQuery}
                onSelect={handleActressSelect}
                onSearchAll={handleActressSearchAll}
                onViewAll={handleViewAllWorks}
              />
            )}
          </div>
        </div>

        {/* ── 作品名で検索 ── */}
        <div className="relative">
          <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[#d4af37]/55">
            <Film size={10} />
            作品名で検索
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Search size={13} style={{ color: 'rgba(212,175,55,0.5)' }} />
            </div>
            <input
              type="search"
              value={articleQuery}
              placeholder="例：巨乳、中出し、VR…"
              autoComplete="off"
              onChange={(e) => setArticleQuery(e.target.value)}
              onKeyDown={handleArticleKeyDown}
              className="w-full rounded-xl border border-[#d4af37]/25 bg-[#080700] py-2.5 pl-9 pr-8 text-sm text-white/90 placeholder:text-white/20 outline-none transition-all duration-150 focus:border-[#d4af37]/60 focus:shadow-[0_0_0_2px_rgba(212,175,55,0.12)]"
            />
            {articleQuery && (
              <button
                type="button"
                onClick={() => setArticleQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white/60"
                aria-label="クリア"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {articleQuery.trim() && (
            <button
              type="button"
              onClick={() => router.push(`/verity/search?q=${encodeURIComponent(articleQuery.trim())}`)}
              className="absolute bottom-0 right-0 translate-y-[calc(100%+6px)] flex items-center gap-1 rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 px-2.5 py-1 text-[10px] font-bold text-[#d4af37] transition-all hover:bg-[#d4af37]/20"
            >
              「{articleQuery.trim()}」を検索
              <ChevronRight size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
