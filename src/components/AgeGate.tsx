'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'

const COOKIE_NAME = 'verity_age_gate'
const MAX_AGE = 7 * 24 * 60 * 60 // 604800 秒 = 7日間

function isVerified(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some(c => c.trim() === `${COOKIE_NAME}=verified`)
}

function setVerifiedCookie() {
  document.cookie = [
    `${COOKIE_NAME}=verified`,
    `max-age=${MAX_AGE}`,
    'path=/',
    'SameSite=Lax',
  ].join('; ')
}

export function AgeGate() {
  const [visible, setVisible] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!isVerified()) setVisible(true)
  }, [])

  if (!visible) return null

  function accept() {
    setVerifiedCookie()
    setVisible(false)

    // ミドルウェアが保持した元パスへ戻る
    const next = searchParams.get('next')
    if (next && next.startsWith('/verity/')) {
      window.location.replace(next)
    }
  }

  function decline() {
    window.location.href = 'https://www.google.com'
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="年齢確認"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0a0f]"
    >
      {/* Scanline texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.012) 3px,rgba(255,255,255,0.012) 4px)',
        }}
      />

      {/* Magenta radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,rgba(226,0,116,0.07)_0%,transparent_70%)]" />

      {/* Corner accents */}
      <div className="pointer-events-none absolute left-6 top-6 h-10 w-10 border-l border-t border-[var(--magenta)]/30" />
      <div className="pointer-events-none absolute right-6 top-6 h-10 w-10 border-r border-t border-[var(--magenta)]/30" />
      <div className="pointer-events-none absolute bottom-6 left-6 h-10 w-10 border-b border-l border-[var(--magenta)]/30" />
      <div className="pointer-events-none absolute bottom-6 right-6 h-10 w-10 border-b border-r border-[var(--magenta)]/30" />

      {/* Card */}
      <div className="relative z-10 mx-4 flex w-full max-w-md flex-col items-center gap-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 px-8 py-12 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-sm">

        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-[11px] font-semibold tracking-[0.45em] text-[var(--magenta)]">
            VERITY
          </span>
          <ShieldAlert
            size={44}
            strokeWidth={1.4}
            className="text-[var(--magenta)] drop-shadow-[0_0_12px_rgba(226,0,116,0.5)]"
          />
        </div>

        {/* Heading + body */}
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
            年齢確認
          </h1>
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            あなたは{' '}
            <span className="font-semibold text-[var(--text)]">18歳以上</span>
            {' '}ですか？
            <br />
            本サイトにはアダルトコンテンツが含まれています。
            <br />
            18歳未満の方、およびアダルトコンテンツに
            <br />
            不快感を感じる方の閲覧はご遠慮ください。
          </p>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />

        {/* Buttons */}
        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <button
            onClick={accept}
            className="flex-1 rounded-lg bg-[var(--magenta)] px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-[0_0_24px_rgba(226,0,116,0.35)] transition-all duration-200 hover:bg-[var(--magenta-dim)] hover:shadow-[0_0_36px_rgba(226,0,116,0.55)] active:scale-[0.98]"
          >
            はい（入場する）
          </button>
          <button
            onClick={decline}
            className="flex-1 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-semibold tracking-wide text-[var(--text-muted)] transition-all duration-200 hover:border-[var(--text-muted)]/60 hover:text-[var(--text)] active:scale-[0.98]"
          >
            いいえ（退出する）
          </button>
        </div>

        <p className="text-[10px] text-[var(--text-muted)]/50">
          同意後は 7 日間この確認を省略します
        </p>
      </div>
    </div>
  )
}
