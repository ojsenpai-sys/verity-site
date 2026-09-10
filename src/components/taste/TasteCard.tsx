'use client'

import { ProxiedImage } from '@/components/ProxiedImage'
import type { TasteCandidate } from '@/lib/taste/types'

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

type Props = {
  candidate: TasteCandidate
}

/** 出題中のパッケージ画像カード。object-containで全体表示（重要部分の欠けを避ける）。 */
export function TasteCard({ candidate }: Props) {
  return (
    <div className="mx-auto w-full max-w-sm px-4 sm:px-0">
      <div
        key={candidate.externalId}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-2xl motion-safe:animate-[taste-fade-in_0.25s_ease]"
      >
        {candidate.imageUrl ? (
          <ProxiedImage
            src={proxyUrl(candidate.imageUrl)}
            alt={candidate.title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
            NO IMAGE
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
          <p className="line-clamp-1 text-[11px] text-white/80">{candidate.title}</p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes taste-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
