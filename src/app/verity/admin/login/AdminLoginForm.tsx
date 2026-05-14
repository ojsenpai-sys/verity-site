'use client'

import { useState } from 'react'
import { Shield, Mail, CheckCircle, AlertCircle } from 'lucide-react'
import { createImplicitClient } from '@/lib/supabase/client'

type Props = { error?: string }

export function AdminLoginForm({ error }: Props) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [err,     setErr]     = useState(error ?? '')

  const supabase = createImplicitClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true); setErr('')
    const confirmUrl = `https://verity-official.com/verity/auth/callback?next=/verity/admin`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: confirmUrl },
    })
    setLoading(false)
    if (error) { setErr(error.message) } else { setSent(true) }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 p-4">
          <CheckCircle size={28} className="text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[var(--text)]">メールを送信しました</h2>
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text)]">{email}</span><br />
            にログインリンクを送りました。
          </p>
        </div>
        <button
          onClick={() => { setSent(false); setErr('') }}
          className="text-xs text-[var(--text-muted)] underline underline-offset-2"
        >
          別のメールアドレスを使う
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center rounded-full bg-amber-500/15 p-4">
          <Shield size={28} className="text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
          VERITY Admin
        </h1>
        <p className="text-sm text-[var(--text-muted)]">管理者専用ログイン</p>
      </div>

      <div className="rounded-2xl border border-amber-500/20 bg-[var(--surface)] p-8 space-y-4 shadow-[0_0_40px_rgba(245,166,35,0.08)]">
        {err && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              {err === 'unauthorized'
                ? 'このアカウントには管理者権限がありません。'
                : err}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              管理者メールアドレス
            </label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-9 pr-4 py-2.5
                           text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
                           focus:border-amber-500/60 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-lg bg-amber-500 py-3 text-sm font-bold text-black
                       shadow-[0_0_20px_rgba(245,166,35,0.3)]
                       hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
          >
            {loading ? '送信中…' : 'マジックリンクを送る'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-[var(--text-muted)]">
        このページは管理者専用です。一般ユーザーは
        <a href="/verity/login" className="text-[var(--magenta)] hover:underline ml-1">こちら</a>
        からログインしてください。
      </p>
    </div>
  )
}
