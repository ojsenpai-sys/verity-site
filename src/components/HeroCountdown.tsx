'use client'

import { useEffect, useState } from 'react'

/** 次のJST深夜0時までの「残り秒数」と「当日の経過率(0-100)」を返す（閲覧者のTZに依存しない） */
function jstDayParts(): { secsLeft: number; progress: number } {
  const nowMs     = Date.now()
  const jstNow    = new Date(nowMs + 9 * 3600_000)
  const secsInDay = jstNow.getUTCHours() * 3600 + jstNow.getUTCMinutes() * 60 + jstNow.getUTCSeconds()
  return { secsLeft: 86_400 - secsInDay, progress: (secsInDay / 86_400) * 100 }
}

function fmt(secsLeft: number): string {
  const h = String(Math.floor(secsLeft / 3600)).padStart(2, '0')
  const m = String(Math.floor((secsLeft % 3600) / 60)).padStart(2, '0')
  const s = String(secsLeft % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** Flashバッジ横の「残り HH:MM:SS」チップ（秒更新） */
export function HeroCountdown() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    const update = () => setLabel(fmt(jstDayParts().secsLeft))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  if (!label) return null

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">残り</span>
      <span className="font-mono text-[15px] font-semibold tabular-nums text-amber-300">{label}</span>
    </span>
  )
}

/** Flash作品カード下端の「当日経過」アージェンシーバー（深夜0時で満タン→リセット） */
export function HeroDayProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => setProgress(jstDayParts().progress)
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-amber-500/10" aria-hidden="true">
      <div
        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(251,191,36,0.6)] transition-[width] duration-1000 ease-linear"
        style={{ width: `${progress.toFixed(2)}%` }}
      />
    </div>
  )
}
