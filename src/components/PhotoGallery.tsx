'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'

function proxyUrl(url: string) {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

type Props = { urls: string[]; title?: string }

export function PhotoGallery({ urls, title }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null)

  const open  = useCallback((i: number) => setLightbox(i),  [])
  const close = useCallback(() => setLightbox(null), [])
  const prev  = useCallback(() => setLightbox(i => i !== null ? (i - 1 + urls.length) % urls.length : null), [urls.length])
  const next  = useCallback(() => setLightbox(i => i !== null ? (i + 1) % urls.length : null), [urls.length])

  useEffect(() => {
    if (lightbox === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')     close()
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, close, prev, next])

  if (urls.length === 0) return null

  return (
    <section className="space-y-3">
      {title && (
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </h3>
      )}

      {/* グリッド */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => open(i)}
            className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--magenta)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxyUrl(url)}
              alt={`gallery ${i + 1}`}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/30 group-hover:opacity-100">
              <ZoomIn size={22} className="text-white drop-shadow" />
            </div>
          </button>
        ))}
      </div>

      {/* ライトボックス */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={close}
        >
          {/* 閉じるボタン */}
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>

          {/* 前へ */}
          {urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev() }}
              className="absolute left-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* 画像 */}
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxyUrl(urls[lightbox])}
              alt={`gallery ${lightbox + 1}`}
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
            <p className="mt-2 text-center text-xs text-white/60">
              {lightbox + 1} / {urls.length}
            </p>
          </div>

          {/* 次へ */}
          {urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next() }}
              className="absolute right-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      )}
    </section>
  )
}
