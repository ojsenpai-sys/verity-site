'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { Film } from 'lucide-react'
import { ProxiedImage } from '@/components/ProxiedImage'
import { trackEvent } from '@/lib/analytics'
import type { ScoredWork } from '@/lib/taste/types'

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

type Props = {
  works: ScoredWork[]
}

export function TasteWorkRecommendations({ works }: Props) {
  const lastFiredRef = useRef(0)

  if (works.length === 0) return null

  function handleClick(cid: string, rank: number) {
    const now = Date.now()
    if (now - lastFiredRef.current < 300) return
    lastFiredRef.current = now
    try {
      trackEvent('taste_result_work_click', { cid, rank })
    } catch {
      /* 計測失敗は遷移を妨げない */
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Film size={15} className="text-[var(--magenta)]" />
        <h2 className="text-sm font-black tracking-wide text-[var(--text)]">RECOMMENDED WORKS</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {works.map(({ candidate, matchLabel, score, reasons }, i) => (
          <Link
            key={candidate.externalId}
            href={`/verity/articles/${candidate.slug}`}
            onClick={() => handleClick(candidate.externalId, i + 1)}
            className="group flex flex-col gap-1.5"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
              {candidate.imageUrl ? (
                <ProxiedImage
                  src={proxyUrl(candidate.imageUrl)}
                  alt={candidate.title}
                  className="h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-[1.05]"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[9px] text-[var(--text-muted)]">
                  NO IMAGE
                </div>
              )}
              <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm ring-1 ring-white/15">
                {score > 0 ? `Taste Match ${score}` : reasons[0]}
              </span>
            </div>
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text)] group-hover:text-[var(--magenta)]">
              {candidate.title}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {matchLabel}
              {reasons.length > 0 ? ` ・ ${reasons[0]}` : ''}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
