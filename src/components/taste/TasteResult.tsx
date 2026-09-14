'use client'

import { RotateCcw, Sparkles } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'
import { TasteActressRecommendations } from './TasteActressRecommendations'
import { TasteWorkRecommendations } from './TasteWorkRecommendations'
import type { TasteResult as TasteResultData } from '@/lib/taste/types'

type Props = {
  result: TasteResultData
  onRetry: () => void
}

export function TasteResult({ result, onRetry }: Props) {
  function handleRetry() {
    try {
      trackEvent('taste_retry')
    } catch {
      /* 計測失敗は再診断を妨げない */
    }
    onRetry()
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-10 sm:px-0">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-purple-600">
          <Sparkles size={16} className="text-white" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-[var(--text)]">診断結果</h1>
      </div>

      {/* YOUR TASTE */}
      <section className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--magenta)]">Your Taste</p>
        <div className="space-y-1.5">
          {result.summary.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-[var(--text)]">
              {line}
            </p>
          ))}
        </div>
      </section>

      <TasteActressRecommendations actresses={result.actresses} />
      <TasteWorkRecommendations works={result.works} />

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={handleRetry}
          className="flex items-center gap-2 rounded-full border border-[var(--border)] px-5 py-2.5 text-xs font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--magenta)]/40 hover:text-[var(--text)]"
        >
          <RotateCcw size={13} />
          もう一度診断する
        </button>
      </div>
    </div>
  )
}
