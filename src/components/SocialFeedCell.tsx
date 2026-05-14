'use client'

import { useState } from 'react'
import { SocialImage } from './SocialImage'

function XLogo({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

type Props = {
  imageUrl:    string
  actressName: string
  screenName:  string
  postUrl:     string
  fanzaHref:   string
}

export function SocialFeedCell({ imageUrl, actressName, screenName, postUrl, fanzaHref }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="group relative aspect-square overflow-hidden bg-[var(--surface-2)]">

      {/* ── Image (z-0) ── */}
      <div className="absolute inset-0 z-0">
        <SocialImage
          src={imageUrl}
          alt={actressName}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* ── Actress name pill (z-10) — slides away on hover or when menu is open ── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent
                    px-2 pb-1.5 pt-4 transition-transform duration-200
                    ${menuOpen ? 'translate-y-full' : 'translate-y-0 group-hover:translate-y-full'}`}
      >
        <p className="truncate text-[9px] font-semibold text-white/90">{actressName}</p>
      </div>

      {/* ── Desktop hover overlay (z-10, hidden below md) ──
          pointer-events-none by default; auto on hover.
          Hidden on mobile so it never intercepts taps. */}
      <div
        className="absolute inset-0 z-10 hidden md:flex flex-col items-center justify-center gap-2.5
                   bg-black/65 opacity-0 transition-opacity duration-200
                   group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
      >
        <a
          href={fanzaHref}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="rounded-full bg-[var(--magenta)] px-3.5 py-1.5 text-[11px] font-bold
                     text-white shadow-[0_0_16px_rgba(226,0,116,0.45)]
                     hover:brightness-110 transition-all whitespace-nowrap"
        >
          FANZAで作品を見る
        </a>
        <a
          href={postUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-white/60 hover:text-white/90 transition-colors"
        >
          <XLogo size={11} />
          <span className="text-[10px]">@{screenName}</span>
        </a>
      </div>

      {/* ── Mobile tap target (z-20, hidden on md+) ──
          Transparent <button> with no href: tapping NEVER navigates, always opens menu.
          Sits above the actress pill (z-10) so every tap hits this button. */}
      <button
        className="absolute inset-0 z-20 md:hidden"
        onClick={() => setMenuOpen(true)}
        aria-label={`${actressName}のメニューを開く`}
      />

      {/* ── Mobile action menu (z-30) ──
          Rendered above everything. Tap the backdrop to dismiss. */}
      {menuOpen && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
          onClick={() => setMenuOpen(false)}
        >
          <p className="mb-1 text-[11px] font-semibold text-white/70">{actressName}</p>

          <a
            href={fanzaHref}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-full bg-[var(--magenta)] py-2.5 text-center
                       text-xs font-bold text-white shadow-[0_0_16px_rgba(226,0,116,0.45)]"
          >
            FANZAで作品を見る
          </a>

          <a
            href={postUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full items-center justify-center gap-2 rounded-full
                       border border-white/20 py-2.5 text-xs font-medium text-white/80"
          >
            <XLogo size={13} />
            X で見る
          </a>

          <button
            className="mt-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  )
}
