'use client'

import { useState } from 'react'
import { Mail, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { createClient, createImplicitClient } from '@/lib/supabase/client'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
// OAuth (Google/X): PKCE フロー → route.ts で code 交換
const CALLBACK  = `${SITE_URL}/verity/auth/callback`
// OTP マジックリンク: Implicit フロー → confirm/page.tsx でハッシュ処理
const CONFIRM   = `${SITE_URL}/verity/auth/confirm`

// ── エラーメッセージのマッピング ───────────────────────────────────────────────

function errorMessage(code: string): string {
  switch (code) {
    case 'otp_expired':
      return 'マジックリンクの有効期限が切れています。再度メールアドレスを入力して送信してください。'
    case 'pkce_verification_failed':
      return 'ブラウザが切り替わったためログインできませんでした。リンクを送ったブラウザ（Safari / Chrome）で直接開いてください。'
    case 'missing_code':
      return 'ログインリンクが無効です。もう一度お試しください。'
    case 'access_denied':
      return 'ログインが拒否されました。もう一度お試しください。'
    case 'auth_error':
      return '認証に失敗しました。もう一度お試しください。'
    default:
      return code
  }
}

// ── SVG アイコン ───────────────────────────────────────────────────────────────

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

// ── メインコンポーネント ────────────────────────────────────────────────────────

type Props = {
  error?: string
  next?:  string
}

type ViewState = 'buttons' | 'email' | 'sent'

export function LoginForm({ error, next }: Props) {
  // otp_expired / pkce_verification_failed はメール送信画面から再試行を促す
  const isRetryError = error === 'otp_expired' || error === 'pkce_verification_failed'

  const [view, setView]       = useState<ViewState>(isRetryError ? 'email' : 'buttons')
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(error ?? '')

  const supabase         = createClient()
  const implicitSupabase = createImplicitClient()
  const callbackUrl      = next ? `${CALLBACK}?next=${encodeURIComponent(next)}` : CALLBACK
  const confirmUrl       = next ? `${CONFIRM}?next=${encodeURIComponent(next)}`  : CONFIRM

  async function signInWithGoogle() {
    setLoading(true); setErr('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: callbackUrl },
    })
    if (error) { setErr(error.message); setLoading(false) }
  }

  async function signInWithX() {
    setLoading(true); setErr('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'twitter',
      options:  { redirectTo: callbackUrl },
    })
    if (error) { setErr(error.message); setLoading(false) }
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true); setErr('')
    // Implicit クライアントを使用。IAB 環境でも code_verifier 不要でログイン可能。
    const { error } = await implicitSupabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: confirmUrl },
    })
    setLoading(false)
    if (error) { setErr(error.message) } else { setView('sent') }
  }

  // ── マジックリンク送信済み ─────────────────────────────────────────────────
  if (view === 'sent') {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 p-4">
          <CheckCircle size={28} className="text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[var(--text)]">メールを送信しました</h2>
          <p className="text-sm text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text)]">{email}</span> に<br />
            ログインリンクを送りました。メールをご確認ください。
          </p>
        </div>

        {/* スマートフォン向けインアプリブラウザ注意 */}
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/8 px-4 py-3 text-left">
          <p className="text-[11px] leading-relaxed text-amber-300/90">
            <span className="font-bold">スマートフォンをお使いの方へ：</span><br />
            メール内のリンクは、<strong>Safari または Chrome</strong> で開いてください。
            Gmail や X などのアプリ内ブラウザで開くとログインできない場合があります。
          </p>
        </div>

        <button
          onClick={() => { setView('email'); setErr('') }}
          className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]"
        >
          別のメールアドレスを使う
        </button>
      </div>
    )
  }

  // ── メール入力フォーム ─────────────────────────────────────────────────────
  if (view === 'email') {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center rounded-full bg-[var(--magenta)]/15 p-4">
            {isRetryError && err ? (
              <RefreshCw size={28} className="text-amber-400" />
            ) : (
              <Mail size={28} className="text-[var(--magenta)]" />
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">メールでログイン</h1>
          <p className="text-sm text-[var(--text-muted)]">
            入力したアドレスにログインリンクを送信します
          </p>
        </div>

        <form onSubmit={sendMagicLink} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5
                       text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
                       focus:border-[var(--magenta)] focus:outline-none transition-colors"
          />

          {err && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{errorMessage(err)}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-lg bg-[var(--magenta)] py-3 text-sm font-bold text-white
                       shadow-[0_0_20px_rgba(226,0,116,0.35)]
                       hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
          >
            {loading ? '送信中…' : isRetryError && err ? 'マジックリンクを再送信する' : 'マジックリンクを送る'}
          </button>
        </form>

        <button
          onClick={() => { setView('buttons'); setErr('') }}
          className="block w-full text-center text-xs text-[var(--text-muted)]
                     hover:text-[var(--text)] transition-colors"
        >
          ← ログイン方法を選びなおす
        </button>
      </div>
    )
  }

  // ── ログイン方法の選択 ─────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center rounded-full bg-[var(--magenta)]/15 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/verity/king.png" alt="王冠" width={28} height={28} style={{ objectFit: 'contain' }} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
          VERITY メンバーログイン
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          会員限定コンテンツ・特別レビューへアクセス
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-3">
        {error && !isRetryError && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMessage(error)}</span>
          </div>
        )}

        {/* Google */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)]
                     bg-white px-4 py-2.5 text-sm font-medium text-gray-800
                     hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          <GoogleIcon size={18} />
          Google でログイン
        </button>

        {/* X (Twitter) */}
        <button
          onClick={signInWithX}
          disabled={loading}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)]
                     bg-black px-4 py-2.5 text-sm font-medium text-white
                     hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          <XIcon size={16} />
          X でログイン
        </button>

        <div className="relative flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[11px] text-[var(--text-muted)]">または</span>
          <div className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Email magic link */}
        <button
          onClick={() => setView('email')}
          className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)]
                     bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--text)]
                     hover:border-[var(--magenta)]/40 transition-colors"
        >
          <Mail size={16} className="text-[var(--text-muted)]" />
          メールでマジックリンクを受け取る
        </button>
      </div>

      <p className="text-center text-xs text-[var(--text-muted)]">
        ログインすることで
        <a href="#" className="text-[var(--magenta)] hover:underline">利用規約</a>
        および
        <a href="#" className="text-[var(--magenta)] hover:underline">プライバシーポリシー</a>
        に同意したとみなします。
      </p>
    </div>
  )
}
