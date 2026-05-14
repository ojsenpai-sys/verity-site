'use client'

import Link from 'next/link'
import { useState } from 'react'

type Props = {
  externalId: string
  name: string
  ruby: string | null
  thumbUrl: string | null
}

function VerityPlaceholder({ initial }: { initial: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[var(--surface)] to-[var(--bg)] select-none">
      {/* ブランドロゴマーク */}
      <svg viewBox="0 0 40 40" className="w-8 h-8 mb-1.5 opacity-15" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,4 36,32 4,32" stroke="#E20074" strokeWidth="2.5" strokeLinejoin="round"/>
        <line x1="20" y1="12" x2="20" y2="25" stroke="#E20074" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="20" cy="29" r="1.5" fill="#E20074"/>
      </svg>
      <span className="text-[8px] font-bold tracking-[0.25em] text-[var(--magenta)]/20 uppercase">Verity</span>
      <span className="mt-2 text-lg font-bold text-[var(--magenta)]/10">{initial}</span>
    </div>
  )
}

export function ActressCard({ externalId, name, ruby, thumbUrl }: Props) {
  const [imgError, setImgError] = useState(false)
  const initial = name.charAt(0)

  return (
    <Link
      href={`/actresses/${externalId}`}
      className="group flex flex-col items-center gap-2 rounded-xl p-2 hover:bg-[var(--surface)] transition-colors"
    >
      <div className="relative w-full aspect-[3/4] overflow-hidden rounded-lg bg-[var(--surface)]">
        {thumbUrl && !imgError ? (
          <img
            src={thumbUrl}
            alt={name}
            className="w-full h-full object-cover object-right group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <VerityPlaceholder initial={initial} />
        )}
      </div>
      <div className="w-full text-center">
        <p className="text-xs font-medium text-[var(--text)] leading-tight line-clamp-2">{name}</p>
        {ruby && (
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{ruby}</p>
        )}
      </div>
    </Link>
  )
}
