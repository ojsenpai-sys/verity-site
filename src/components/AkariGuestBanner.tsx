'use client'

import Link from 'next/link'
import { useAuth } from './AuthProvider'

export function AkariGuestBanner() {
  const { user, loading } = useAuth()
  if (loading || user) return null

  return (
    <Link href="/verity/login" className="block group" aria-label="AIあかりコンシェルジュ — 無料会員登録">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--magenta)]/35 bg-gradient-to-r from-[#1a0814] via-[#12091a] to-[#0c0d1e] p-5 shadow-[0_0_40px_rgba(226,0,116,0.10)] transition-all duration-300 hover:border-[var(--magenta)]/60 hover:shadow-[0_0_60px_rgba(226,0,116,0.22)]">
        {/* 背景グロウ */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--magenta)]/6 via-transparent to-purple-900/12" />
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--magenta)]/10 blur-3xl" />

        <div className="relative flex items-center gap-4">
          {/* あかり画像 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="relative h-[84px] w-[60px] shrink-0 overflow-hidden rounded-xl border border-[var(--magenta)]/30 shadow-[0_0_20px_rgba(226,0,116,0.25)] sm:h-[100px] sm:w-[72px]">
            <img
              src="/assets/verity/akari_01.png"
              alt="AIメイド あかり"
              className="h-full w-full object-cover object-top"
            />
          </div>

          {/* テキストエリア */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--magenta)]/45 bg-[var(--magenta)]/20 px-2.5 py-0.5 text-[10px] font-black tracking-widest text-[var(--magenta)] uppercase">
                会員限定
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">✨ AIルームがオープン</span>
            </div>

            <h3 className="text-sm font-black leading-snug text-[var(--text)] sm:text-[15px]">
              AIメイド・あかりコンシェルジュルームがオープン♡
            </h3>

            <p className="text-[11px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
              あかりがご主人様好みの最新作品を個別アテンド！今なら毎日15回、日常の甘い雑談も楽しめます。
              <span className="font-semibold text-[var(--magenta)]"> 衣装が脱げる限定モードも…？</span>
            </p>

            {/* モバイル CTA */}
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--magenta)] sm:hidden">
              👉 無料会員登録してあかりに会いに行く
            </p>
          </div>

          {/* デスクトップ CTA ボタン */}
          <div className="hidden shrink-0 flex-col items-center gap-1.5 sm:flex">
            <div className="rounded-full bg-[var(--magenta)] px-4 py-2 text-xs font-black text-white shadow-[0_0_18px_rgba(226,0,116,0.45)] transition-all duration-300 group-hover:shadow-[0_0_28px_rgba(226,0,116,0.65)] group-hover:brightness-110">
              無料会員登録
            </div>
            <span className="text-[9px] text-[var(--text-muted)]">あかりに会いに行く →</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
