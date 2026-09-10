'use client'

import { Sparkles } from 'lucide-react'
import { TASTE_QUESTION_COUNT } from '@/lib/taste/types'

type Props = {
  onStart: () => void
  disabled?: boolean
}

export function TasteIntro({ onStart, disabled }: Props) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-purple-600 shadow-[0_0_30px_rgba(226,0,116,0.35)]">
        <Sparkles size={24} className="text-white" />
      </div>

      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--magenta)]">
          VERITY Taste Check
        </p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
          選ぶだけで、あなたの
          <br className="sm:hidden" />
          &ldquo;好き&rdquo;が見えてくる。
        </h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">
          気になる作品を直感で選んでください。
          <br />
          VERITYがあなたに合いそうな作品と女優を探します。
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-[0_0_24px_rgba(226,0,116,0.45)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? '準備中…' : '診断をはじめる'}
      </button>

      <p className="text-[10px] text-[var(--text-muted)]">
        全{TASTE_QUESTION_COUNT}問・ログイン不要・約1分
      </p>
    </div>
  )
}
