'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

type Props = {
  currentPage:  number
  totalPages:   number
}

export function Pagination({ currentPage, totalPages }: Props) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  if (totalPages <= 1) return null

  function go(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  // ページ番号リスト（最大7つ、省略付き）
  function buildRange(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const items: (number | '…')[] = [1]
    if (currentPage > 3) items.push('…')
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) {
      items.push(p)
    }
    if (currentPage < totalPages - 2) items.push('…')
    items.push(totalPages)
    return items
  }

  const range = buildRange()

  return (
    <nav aria-label="ページナビゲーション" className="flex items-center justify-center gap-1.5 flex-wrap">
      {/* 前へ */}
      <button
        onClick={() => go(currentPage - 1)}
        disabled={currentPage === 1}
        className="
          inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]
          px-3.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors
          hover:border-[var(--magenta)] hover:text-[var(--magenta)]
          disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-muted)]
        "
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 2L4 6l4 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        前へ
      </button>

      {/* ページ番号 */}
      {range.map((item, i) =>
        item === '…' ? (
          <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-[var(--text-muted)]">…</span>
        ) : (
          <button
            key={item}
            onClick={() => go(item as number)}
            className={`
              inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-colors
              ${item === currentPage
                ? 'border-[var(--magenta)] bg-[var(--magenta)]/10 text-[var(--magenta)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)]'
              }
            `}
          >
            {item}
          </button>
        )
      )}

      {/* 次へ */}
      <button
        onClick={() => go(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="
          inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]
          px-3.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors
          hover:border-[var(--magenta)] hover:text-[var(--magenta)]
          disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-muted)]
        "
      >
        次へ
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </nav>
  )
}
