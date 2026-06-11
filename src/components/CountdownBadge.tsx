'use client'

import { useEffect, useState } from 'react'

interface CountdownBadgeProps {
  releaseAt: string // ISO date string (article.published_at)
}

function computeLabel(releaseAt: string): string | null {
  const diff = new Date(releaseAt).getTime() - Date.now()
  if (diff <= 0) return null  // already released

  const totalMinutes = Math.floor(diff / 60_000)
  const hours        = Math.floor(diff / 3_600_000)
  const days         = Math.floor(hours / 24)

  if (hours > 72) return null  // too far ahead — no urgency

  if (totalMinutes < 60) return `あと${totalMinutes}分`
  if (hours < 24)        return `あと${hours}時間で解禁`
  const remH = hours % 24
  return remH > 0 ? `あと${days}日${remH}時間` : `あと${days}日`
}

function isJstMidnightRelease(releaseAt: string): boolean {
  // JST = UTC+9: midnight JST = 15:00 UTC of the previous day
  const jst = new Date(new Date(releaseAt).getTime() + 9 * 60 * 60 * 1000)
  return jst.getUTCHours() === 0 && jst.getUTCMinutes() === 0
}

/**
 * サムネイル最下部に絶対配置するカウントダウンオーバーレイ。
 * 発売72時間以内の予約作品にのみ表示（それ以外は null を返す）。
 * Server Component から渡された releaseAt を受け取り、client で計算する。
 */
export function CountdownBadge({ releaseAt }: CountdownBadgeProps) {
  // hydration mismatch を防ぐため、初期値は null（サーバーは何もレンダリングしない）
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    function tick() {
      setLabel(computeLabel(releaseAt))
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [releaseAt])

  if (!label) return null

  const diff        = new Date(releaseAt).getTime() - Date.now()
  const isVeryClose = diff > 0 && diff < 6 * 3_600_000  // 6時間以内は赤く強調
  const isMidnight  = isJstMidnightRelease(releaseAt)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/80 to-transparent pb-1.5 pt-5 text-[10px] font-black tracking-wide">
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          isVeryClose ? 'animate-pulse bg-red-400' : 'bg-amber-400',
        ].join(' ')}
      />
      <span className={isVeryClose ? 'text-red-300' : 'text-amber-300'}>
        {isMidnight ? '0時解禁！' : label}
      </span>
    </div>
  )
}
