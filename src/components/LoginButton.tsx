'use client'

import Link from 'next/link'
import { User, LogIn } from 'lucide-react'
import { useAuth } from './AuthProvider'

export function LoginButton() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--surface-2)]" />
    )
  }

  if (user) {
    return (
      <Link
        href="/verity/profile"
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
      className="flex items-center gap-1.5 rounded-lg bg-[var(--magenta)]
                 px-3 py-1.5 text-xs font-bold text-white transition-all
                 hover:brightness-110 hover:shadow-[0_0_16px_rgba(226,0,116,0.4)]"
    >
      <LogIn size={13} />
      ログイン
    </Link>
  )
}
