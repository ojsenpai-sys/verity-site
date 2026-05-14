'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createImplicitClient } from '@/lib/supabase/client'

// ── OTP マジックリンク用コールバックページ（Implicit フロー） ──────────────────
//
// Supabase が `#access_token=...&refresh_token=...` をハッシュフラグメントとして
// このページに渡す。サーバーはハッシュを受け取れないため、クライアントサイドで処理する。
// @supabase/auth-js の detectSessionInUrl が自動的にハッシュを検出してセッションを設定する。

export default function AuthConfirmPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const next = searchParams.get('next') ?? '/verity/profile'
    const safeNext = next.startsWith('/verity') ? next : '/verity/profile'

    const supabase = createImplicitClient()

    // getSession() を呼ぶことで detectSessionInUrl がハッシュフラグメントを処理する
    supabase.auth.getSession().then(({ data: { session }, error: err }) => {
      if (err) {
        console.error('[auth/confirm] getSession error:', err.message)
        setError(err.message)
        return
      }
      if (session) {
        router.replace(safeNext)
        return
      }

      // ハッシュからのセッション検出を onAuthStateChange で待機
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          subscription.unsubscribe()
          router.replace(safeNext)
        }
      })

      // 10 秒タイムアウト
      const timer = setTimeout(() => {
        subscription.unsubscribe()
        setError('otp_expired')
      }, 10_000)

      return () => {
        clearTimeout(timer)
        subscription.unsubscribe()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {error === 'otp_expired'
              ? 'マジックリンクの有効期限が切れています。'
              : '認証に失敗しました。'}
          </p>
          <a
            href="/verity/login"
            className="inline-block rounded-lg bg-[var(--magenta)] px-6 py-2.5
                       text-sm font-bold text-white hover:brightness-110 transition-all"
          >
            ログインページへ戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
        <Loader2 size={28} className="animate-spin text-[var(--magenta)]" />
        <p className="text-sm">ログイン処理中…</p>
      </div>
    </div>
  )
}
