'use client'

import { useEffect, useState } from 'react'

/** JST深夜0時（次の0時）までの残り時間を HH:MM 形式で返す */
function getCountdownToMidnightJst(): string {
  const nowMs    = Date.now()
  const jstNow   = new Date(nowMs + 9 * 3600_000)
  const midnight = new Date(jstNow)
  midnight.setUTCHours(0, 0, 0, 0)
  // 現在JST時刻が0時以降 → 次の0時は明日
  midnight.setUTCDate(midnight.getUTCDate() + 1)
  const diffMs   = midnight.getTime() - (nowMs + 9 * 3600_000)
  const h = Math.floor(diffMs / 3_600_000)
  const m = Math.floor((diffMs % 3_600_000) / 60_000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function HeroCountdown() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    setLabel(getCountdownToMidnightJst())
    const id = setInterval(() => setLabel(getCountdownToMidnightJst()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!label) return null

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      あと{label}で更新
    </span>
  )
}
