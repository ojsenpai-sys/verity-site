'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useState, useEffect, useRef } from 'react'

export function SearchInput({ defaultValue = '' }: { defaultValue?: string }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(defaultValue)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // searchParams が変わったとき（戻るボタン等）に同期
  useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setValue(q)

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (q.trim()) {
        params.set('q', q.trim())
        params.delete('page')
        params.delete('row')
      } else {
        params.delete('q')
        params.delete('page')
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`)
      })
    }, 280)
  }

  function handleClear() {
    setValue('')
    const params = new URLSearchParams(searchParams.toString())
    params.delete('q')
    params.delete('page')
    params.delete('row')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className="relative w-full max-w-sm">
      {/* 検索アイコン */}
      <svg
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]"
        viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
      >
        <circle cx="8.5" cy="8.5" r="5.5"/>
        <path d="M14.5 14.5L18 18" strokeLinecap="round"/>
      </svg>

      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder="女優名・よみがなで検索"
        className="
          w-full rounded-full border border-[var(--border)] bg-[var(--surface)]
          py-2 pl-9 pr-8 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]
          focus:outline-none focus:border-[var(--magenta)] focus:ring-1 focus:ring-[var(--magenta)]/30
          transition-colors
        "
      />

      {/* クリアボタン */}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          aria-label="検索をクリア"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l12 12M13 1L1 13" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}
