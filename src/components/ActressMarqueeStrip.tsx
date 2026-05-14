'use client'

import { useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NowPrinting } from './NowPrinting'
import { cidToCdnUrl, isBadImageUrl } from '@/lib/cidUtils'

export type MarqueeTile = {
  name: string
  externalId: string
  imageUrl: string | null
}

function proxyUrl(url: string) {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

function resolveImageUrl(tile: MarqueeTile): string | null {
  if (!isBadImageUrl(tile.imageUrl)) return tile.imageUrl!
  return tile.externalId ? cidToCdnUrl(tile.externalId, 'pl') : null
}

const SPEED = 0.15

export function ActressMarqueeStrip({ tiles }: { tiles: MarqueeTile[] }) {
  const innerRef  = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const boostRef  = useRef(0)
  const rafRef    = useRef(0)
  const offsetRef = useRef(0)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner || tiles.length === 0) return

    const tick = () => {
      const half = Math.round(inner.scrollWidth / 2)
      if (half > 0) {
        if (!pausedRef.current) offsetRef.current += SPEED
        offsetRef.current += boostRef.current
        boostRef.current = 0
        if (offsetRef.current >= half) offsetRef.current -= half
        if (offsetRef.current < 0)     offsetRef.current += half
        inner.style.transform = `translateX(-${offsetRef.current}px)`
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tiles.length])

  const nudge = useCallback((dir: -1 | 1) => {
    boostRef.current += dir * 300
  }, [])

  return (
    <>
      {/* ── Mobile: swipe scroll-snap (visible below sm breakpoint) ── */}
      <div
        className="sm:hidden overflow-x-auto pb-4"
        style={{
          scrollbarWidth:    'none',
          scrollSnapType:    'x mandatory',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
      >
        <div className="flex gap-3 px-1">
          {tiles.map((tile, i) => {
            const imgUrl = resolveImageUrl(tile)
            return (
              <Link
                key={i}
                href={`/actresses/${tile.externalId}`}
                className="flex shrink-0 flex-col items-center gap-2"
                style={{ scrollSnapAlign: 'start' }}
              >
                <div className="h-44 w-28 overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
                  {imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyUrl(imgUrl)}
                      alt={tile.name}
                      className="h-full w-full object-cover object-right"
                    />
                  ) : (
                    <NowPrinting />
                  )}
                </div>
                <span className="w-28 truncate text-center text-[11px] text-[var(--text-muted)]">
                  {tile.name}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Desktop: auto-scrolling RAF marquee (hidden below sm breakpoint) ── */}
      <div
        className="hidden sm:block group/marquee relative overflow-hidden pt-6 pb-14"
        onMouseEnter={() => { pausedRef.current = true }}
        onMouseLeave={() => { pausedRef.current = false }}
      >
        {/* Edge fade */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[var(--bg)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[var(--bg)] to-transparent" />

        {/* Arrow buttons — visible on hover */}
        {(
          [[-1, 'left-3', 'prev', <ChevronLeft key="l" size={16} />],
           [ 1, 'right-3', 'next', <ChevronRight key="r" size={16} />]] as const
        ).map(([dir, pos, label, icon]) => (
          <button
            key={label}
            onClick={() => nudge(dir)}
            className={`absolute ${pos} top-1/2 z-20 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)]/90 text-[var(--text-muted)] opacity-0 backdrop-blur-sm transition-all duration-200 hover:border-[var(--magenta)] hover:text-[var(--magenta)] hover:shadow-[0_0_14px_rgba(226,0,116,0.35)] group-hover/marquee:opacity-100`}
            aria-label={label === 'prev' ? '前へ' : '次へ'}
          >
            {icon}
          </button>
        ))}

        <div ref={innerRef} className="flex gap-4 will-change-transform">
          {[...tiles, ...tiles].map((tile, i) => (
            <Link
              key={i}
              href={`/actresses/${tile.externalId}`}
              aria-hidden={i >= tiles.length}
              tabIndex={i >= tiles.length ? -1 : undefined}
              className="group/tile relative z-0 flex shrink-0 flex-col items-center gap-2 origin-top transition-all duration-300 hover:z-50 hover:scale-110 hover:drop-shadow-xl"
            >
              <div className="h-40 w-28 overflow-hidden rounded-lg ring-1 ring-[var(--border)] transition-all duration-300 group-hover/tile:ring-2 group-hover/tile:ring-[var(--magenta)]">
                {(() => {
                  const imgUrl = resolveImageUrl(tile)
                  return imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proxyUrl(imgUrl)}
                      alt={tile.name}
                      className="h-full w-full object-cover object-right"
                    />
                  ) : (
                    <NowPrinting />
                  )
                })()}
              </div>
              <span className="w-28 truncate text-center text-[11px] text-[var(--text-muted)] transition-colors group-hover/tile:text-[var(--magenta)]">
                {tile.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
