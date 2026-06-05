'use client'

import Link from 'next/link'
import { User, LogIn, ChevronRight } from 'lucide-react'
import { useAuth } from './AuthProvider'

type Props = {
  variant?: 'header' | 'drawer'
  onClick?: () => void
}

export function LoginButton({ variant = 'header', onClick }: Props) {
  const { user, loading } = useAuth()

  /* ── ローディング ─────────────────────────────────────────────── */
  if (loading) {
    if (variant === 'drawer') {
      return <div className="h-14 w-full animate-pulse rounded-xl bg-[var(--surface-2)]" />
    }
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--surface-2)]" />
  }

  /* ── ヘッダー（従来の小ボタン） ───────────────────────────────── */
  if (variant === 'header') {
    if (user) {
      return (
        <Link
          href="/verity/profile"
          onClick={onClick}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)]
                     bg-[var(--surface)] px-3 py-1.5 text-xs font-medium
                     text-[var(--text-muted)] transition-colors
                     hover:border-[var(--magenta)]/40 hover:text-[var(--text)]"
        >
          <User size={13} />
          マイページ
        </Link>
      )
    }
    return (
      <Link
        href="/verity/login"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-lg bg-[var(--magenta)]
                   px-3 py-1.5 text-xs font-bold text-white transition-all
                   hover:brightness-110 hover:shadow-[0_0_16px_rgba(226,0,116,0.4)]"
      >
        <LogIn size={13} />
        ログイン
      </Link>
    )
  }

  /* ── ドロワー（プレミアムフルwidthボタン） ──────────────────────── */
  if (user) {
    return (
      <Link
        href="/verity/profile"
        onClick={onClick}
        className="group relative w-full flex items-center gap-3.5 overflow-hidden
                   rounded-xl border border-[var(--magenta)]/35 bg-black/40
                   px-5 py-4 backdrop-blur-sm
                   transition-all duration-300
                   hover:border-[var(--magenta)]/80
                   hover:bg-[var(--magenta)]/8
                   hover:shadow-[0_0_28px_rgba(226,0,116,0.38)]
                   active:scale-[0.98]"
      >
        {/* grid-line glow overlay on hover */}
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            backgroundImage:
              'linear-gradient(rgba(226,0,116,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.07) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* icon circle */}
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center
                         rounded-full border border-[var(--magenta)]/30 bg-[var(--magenta)]/10
                         transition-all duration-300
                         group-hover:border-[var(--magenta)]/70
                         group-hover:bg-[var(--magenta)]/20
                         group-hover:shadow-[0_0_14px_rgba(226,0,116,0.45)]">
          <User size={16} className="text-[var(--magenta)]" />
        </span>

        {/* text block */}
        <span className="relative flex-1 min-w-0">
          <span className="block text-sm font-bold leading-tight text-[var(--magenta)]
                           transition-colors duration-300 group-hover:text-white">
            マイページ
          </span>
          <span className="block mt-0.5 text-[10px] font-medium tracking-[0.18em]
                           uppercase text-[var(--magenta)]/55
                           transition-colors duration-300 group-hover:text-[var(--magenta)]/90">
            My Profile
          </span>
        </span>

        {/* chevron arrow */}
        <ChevronRight
          size={16}
          className="relative shrink-0 text-[var(--magenta)]/45
                     transition-all duration-300
                     group-hover:translate-x-0.5 group-hover:text-[var(--magenta)]"
        />
      </Link>
    )
  }

  /* drawer — not logged in */
  return (
    <Link
      href="/verity/login"
      onClick={onClick}
      className="group relative w-full flex items-center gap-3.5 overflow-hidden
                 rounded-xl bg-[var(--magenta)] px-5 py-4
                 transition-all duration-300
                 hover:brightness-110
                 hover:shadow-[0_0_32px_rgba(226,0,116,0.55)]
                 active:scale-[0.98]"
    >
      {/* shimmer sweep */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      {/* icon circle */}
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center
                       rounded-full bg-white/15">
        <LogIn size={16} className="text-white" />
      </span>

      {/* text block */}
      <span className="relative flex-1 min-w-0">
        <span className="block text-sm font-bold leading-tight text-white">
          ログイン / 新規登録
        </span>
        <span className="block mt-0.5 text-[10px] font-medium tracking-[0.18em] uppercase text-white/65">
          Sign in to VERITY
        </span>
      </span>

      {/* chevron */}
      <ChevronRight
        size={16}
        className="relative shrink-0 text-white/60
                   transition-all duration-300
                   group-hover:translate-x-0.5 group-hover:text-white"
      />
    </Link>
  )
}
