'use client'

import { useRef } from 'react'
import { Users, ArrowRight } from 'lucide-react'
import { ProxiedImage } from '@/components/ProxiedImage'
import { actressPageHref } from '@/lib/actressUrl'
import { trackEvent } from '@/lib/analytics'
import type { ScoredActress } from '@/lib/taste/types'

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

type Props = {
  actresses: ScoredActress[]
}

export function TasteActressRecommendations({ actresses }: Props) {
  const lastFiredRef = useRef(0)

  if (actresses.length === 0) return null

  function handleClick(actressId: string, actressName: string, rank: number) {
    const now = Date.now()
    if (now - lastFiredRef.current < 300) return
    lastFiredRef.current = now
    try {
      trackEvent('taste_result_actress_click', { actressId, actressName, rank })
    } catch {
      /* 計測失敗は遷移を妨げない */
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-violet-400" />
        <h2 className="text-sm font-black tracking-wide text-[var(--text)]">RECOMMENDED ACTRESSES</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {actresses.map(({ info, reason }, i) => (
          <a
            key={info.externalId}
            href={actressPageHref(info.externalId)}
            onClick={() => handleClick(info.externalId, info.name, i + 1)}
            className="group flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 text-center transition-colors hover:border-violet-400/40"
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]">
              {info.imageUrl ? (
                <ProxiedImage
                  src={proxyUrl(info.imageUrl)}
                  alt={info.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--text-muted)]">
                  NO IMAGE
                </div>
              )}
            </div>
            <p className="line-clamp-1 text-[11px] font-bold text-[var(--text)] group-hover:text-violet-400">
              {info.name}
            </p>
            <p className="line-clamp-1 text-[9px] text-[var(--text-muted)]">{reason}</p>
            <span className="flex items-center gap-0.5 text-[9px] text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">
              詳細を見る <ArrowRight size={9} />
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
