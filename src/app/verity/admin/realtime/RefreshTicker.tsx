'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const INTERVAL = 60

export function RefreshTicker({ fetchedAt }: { fetchedAt: string }) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(INTERVAL)

  // fetchedAt が変わる = サーバーが再フェッチ完了 → カウントダウンをリセット
  useEffect(() => {
    setCountdown(INTERVAL)
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          router.refresh()
          return INTERVAL
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [router, fetchedAt])

  const jstStr = (() => {
    try {
      return new Date(new Date(fetchedAt).getTime() + 9 * 3600_000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19) + ' JST'
    } catch {
      return fetchedAt
    }
  })()

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      <span style={{ color: 'rgba(255,255,255,0.35)' }}>
        最終取得: <span className="font-mono" style={{ color: 'rgba(255,255,255,0.55)' }}>{jstStr}</span>
      </span>
      <span className="flex items-center gap-1.5" style={{ color: 'rgba(170,255,0,0.7)' }}>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: '#aaff00', boxShadow: '0 0 6px #aaff00' }}
        />
        <span className="font-mono">{countdown}</span>秒後に自動更新
      </span>
    </div>
  )
}
