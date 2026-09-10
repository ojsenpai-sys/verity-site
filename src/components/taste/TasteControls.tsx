'use client'

import { useEffect, useRef } from 'react'
import { Heart, Minus, X } from 'lucide-react'
import type { TasteAnswer } from '@/lib/taste/types'

type Props = {
  onAnswer: (answer: TasteAnswer) => void
  disabled?: boolean
}

const KEY_MAP: Record<string, TasteAnswer> = {
  ArrowLeft: 'dislike',
  ArrowDown: 'neutral',
  ArrowRight: 'like',
}

export function TasteControls({ onAnswer, disabled }: Props) {
  // 高速連打・同一回答二重登録防止（ActressLink.tsx の500msガードと同方針）
  const lastFiredRef = useRef(0)

  const fire = (answer: TasteAnswer) => {
    if (disabled) return
    const now = Date.now()
    if (now - lastFiredRef.current < 350) return
    lastFiredRef.current = now
    onAnswer(answer)
  }

  // keydownリスナーは1回だけ登録し、呼び出す実処理は常に最新のfireをrefから読む。
  // fire自体をeffect依存に含めると、質問が進むたびにonAnswerの参照が変わり
  // listenerの張り直しが発生する（副作用は無いが）ため、ref経由で回避する。
  const fireRef = useRef(fire)
  fireRef.current = fire

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      // 入力欄等にフォーカスがある場合は既存アクセシビリティ優先で介入しない
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const mapped = KEY_MAP[e.key]
      if (!mapped) return
      e.preventDefault()
      fireRef.current(mapped)
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const btnBase =
    'flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl border py-3.5 text-[11px] font-bold transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div
      className={[
        'flex gap-2.5 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3',
        'sm:static sm:px-0 sm:pb-0',
        'fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-md',
        'sm:relative sm:border-0 sm:bg-transparent sm:backdrop-blur-none',
      ].join(' ')}
    >
      <button
        type="button"
        aria-label="好みではない"
        disabled={disabled}
        onClick={() => fire('dislike')}
        className={`${btnBase} border-[var(--border)] text-[var(--text-muted)] hover:border-white/20 hover:text-[var(--text)]`}
      >
        <X size={20} />
        好みではない
      </button>
      <button
        type="button"
        aria-label="どちらでもない"
        disabled={disabled}
        onClick={() => fire('neutral')}
        className={`${btnBase} border-[var(--border)] text-[var(--text-muted)] hover:border-white/20 hover:text-[var(--text)]`}
      >
        <Minus size={20} />
        どちらでもない
      </button>
      <button
        type="button"
        aria-label="好み"
        disabled={disabled}
        onClick={() => fire('like')}
        className={`${btnBase} border-[var(--magenta)]/40 bg-[var(--magenta)]/10 text-[var(--magenta)] hover:bg-[var(--magenta)]/20`}
      >
        <Heart size={20} className="fill-[var(--magenta)]/30" />
        好み
      </button>
    </div>
  )
}
