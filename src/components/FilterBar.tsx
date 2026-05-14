'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { useCallback, useState } from 'react'

const VISIBLE_TAG_COUNT = 30

type FilterBarProps = {
  categories: string[]
  sources: string[]
  tags: string[]
}

export function FilterBar({ categories, sources, tags }: FilterBarProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [showAllTags, setShowAllTags] = useState(false)

  const logClick = useCallback((targetType: 'genre' | 'actress', targetId: string) => {
    fetch('/verity/api/logs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ target_type: targetType, target_id: targetId }),
    }).catch(() => {})
  }, [])

  const push = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (value) {
        next.set(key, value)
        // ジャンル/カテゴリのクリックをログに記録（ログインユーザーのみ有効）
        if (key === 'tag' || key === 'category') logClick('genre', value)
      } else {
        next.delete(key)
      }
      next.delete('page')
      router.push(`/?${next.toString()}`)
    },
    [params, router, logClick]
  )

  const active = (key: string, value: string) => params.get(key) === value

  const clear = () => router.push('/')

  const hasFilter =
    params.has('category') || params.has('source') || params.has('tag') || params.has('q')

  const visibleTags = tags.slice(0, VISIBLE_TAG_COUNT)
  const moreTags    = tags.slice(VISIBLE_TAG_COUNT)

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          placeholder="タイトル・タグで検索…"
          defaultValue={params.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter')
              push('q', (e.target as HTMLInputElement).value || null)
          }}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--magenta)] outline-none transition-colors"
        />
      </div>

      {/* 予約誘導バナー */}
      <div
        className="relative overflow-hidden rounded-xl px-4 py-3"
        style={{
          background:
            'linear-gradient(135deg, rgba(226,0,116,0.13) 0%, rgba(18,18,26,0.97) 55%, rgba(251,191,36,0.09) 100%)',
          border: '1px solid rgba(226,0,116,0.32)',
          boxShadow:
            '0 0 24px rgba(226,0,116,0.1), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* top shimmer */}
        <div
          className="pointer-events-none absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(226,0,116,0.7) 40%, rgba(251,191,36,0.5) 70%, transparent 100%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: 'rgba(251,191,36,0.14)',
              border: '1px solid rgba(251,191,36,0.28)',
            }}
          >
            <Zap size={13} className="text-amber-400" />
          </div>
          <p className="text-[11px] sm:text-xs font-medium leading-snug tracking-wide text-[var(--text-muted)]">
            ※ジャンル選択で
            <span
              className="mx-1 font-extrabold"
              style={{
                background: 'linear-gradient(90deg, #E20074 0%, #ff6eb4 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              【最速】
            </span>
            予約・先行公開コンテンツを自動セレクト
          </p>
        </div>
      </div>

      {/* Category / Source / Tag chips */}
      {(categories.length > 0 || sources.length > 0 || tags.length > 0 || hasFilter) && (
        <div className="space-y-2">
          {(categories.length > 0 || sources.length > 0 || tags.length > 0) && (
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              ジャンル
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => push('category', active('category', cat) ? null : cat)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  active('category', cat)
                    ? 'border-[var(--magenta)] bg-[var(--magenta)] text-white'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)]'
                }`}
              >
                {cat}
              </button>
            ))}

            {sources.map((src) => (
              <button
                key={src}
                onClick={() => push('source', active('source', src) ? null : src)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  active('source', src)
                    ? 'border-[var(--magenta)] bg-[var(--magenta)] text-white'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)]'
                }`}
              >
                {src}
              </button>
            ))}

            {/* 上位 30 タグ — 常時表示 */}
            {visibleTags.map((tag) => (
              <button
                key={tag}
                onClick={() => push('tag', active('tag', tag) ? null : tag)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  active('tag', tag)
                    ? 'border-[var(--magenta)] bg-[var(--magenta)] text-white'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)]'
                }`}
              >
                #{tag}
              </button>
            ))}

            {/* 31 件目以降 — アコーディオン */}
            {showAllTags &&
              moreTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => push('tag', active('tag', tag) ? null : tag)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    active('tag', tag)
                      ? 'border-[var(--magenta)] bg-[var(--magenta)] text-white'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)]'
                  }`}
                >
                  #{tag}
                </button>
              ))}

            {moreTags.length > 0 && (
              <button
                onClick={() => setShowAllTags((v) => !v)}
                className="flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
              >
                {showAllTags ? (
                  <>
                    <ChevronUp size={12} />
                    閉じる
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />
                    もっと見る ({moreTags.length})
                  </>
                )}
              </button>
            )}

            {hasFilter && (
              <button
                onClick={clear}
                className="flex items-center gap-1 rounded-full border border-red-700/50 px-3 py-1 text-xs text-red-400 hover:border-red-500 transition-colors"
              >
                <X size={12} /> クリア
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
