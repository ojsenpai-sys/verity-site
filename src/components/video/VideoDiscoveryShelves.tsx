'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ProxiedImage } from '@/components/ProxiedImage'
import { trackEvent } from '@/lib/analytics'
import { catalogMeta, dwellMs, VIDEO_DISCOVERY_SOURCE } from '@/lib/videoDiscoverySelection.mjs'
import type { VideoDiscoveryItem, VideoRow } from '@/lib/videoDiscovery'
import { VideoPreviewDialog, type CloseReason } from './VideoPreviewDialog'

// VIDEO DISCOVERY の棚（横スクロール）＋カード＋プレビュー制御。
//
// - 初期HTMLはポスター/タイトル/女優/発売日/作品ページへのリンクのみ（iframe=0）。
// - カードは作品ページへの <a>（クローラー・新規タブ用）だが、通常クリック/Enter/Space では
//   遷移せずプレビューを開く。hover だけでは何も読み込まない。
// - プレビュー（iframe）は同時に最大1つ。別カードを開くと前のダイアログは key 変更でアンマウント。

export type Shelf = {
  row:   VideoRow
  label: string
  sub:   string
  items: VideoDiscoveryItem[]
}

type Active = { item: VideoDiscoveryItem; openedAt: number; opener: HTMLElement | null }

const BADGE: Record<VideoRow, { text: string; className: string }> = {
  new:     { text: 'NEW',     className: 'bg-red-600 text-white' },
  popular: { text: 'POPULAR', className: 'bg-amber-400 text-amber-950' },
}

function readEntry(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('from')?.slice(0, 32) ?? null
  } catch {
    return null
  }
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => setReduce(Boolean(conn?.saveData) || Boolean(mq?.matches))
    update()
    mq?.addEventListener?.('change', update)
    return () => mq?.removeEventListener?.('change', update)
  }, [])
  return reduce
}

export function VideoDiscoveryShelves({ shelves }: { shelves: Shelf[] }) {
  const [active, setActive] = useState<Active | null>(null)
  // 直近のアクティブ状態（イベントハンドラから同期参照するため state と併せて更新する）
  const activeRef = useRef<Active | null>(null)
  const reduceMotion = useReduceMotion()

  const trackClose = useCallback((a: Active, reason: CloseReason | 'switch' | 'pagehide') => {
    trackEvent('video_catalog_preview_close', {
      cid: a.item.cid,
      ...catalogMeta(a.item.row, a.item.position),
      dwell_ms: dwellMs(a.openedAt, Date.now()),
      reason,
    })
  }, [])

  const openPreview = useCallback((item: VideoDiscoveryItem, opener: HTMLElement | null) => {
    const prev = activeRef.current
    if (prev?.item.cid === item.cid) return
    if (prev) trackClose(prev, 'switch')
    trackEvent('video_catalog_preview_open', { cid: item.cid, ...catalogMeta(item.row, item.position) })
    const next = { item, openedAt: Date.now(), opener }
    activeRef.current = next
    setActive(next)
  }, [trackClose])

  const closePreview = useCallback((reason: CloseReason) => {
    const a = activeRef.current
    if (!a) return
    trackClose(a, reason)
    activeRef.current = null
    setActive(null)
    if (reason !== 'article_cta') a.opener?.focus()
  }, [trackClose])

  // 開いたままページを離れた場合も close を記録（ベストエフォート）
  useEffect(() => {
    if (!active) return
    const onPageHide = () => { if (activeRef.current) trackClose(activeRef.current, 'pagehide') }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [active, trackClose])

  return (
    <>
      {shelves.map((shelf, si) => (
        <ShelfRow
          key={shelf.row}
          shelf={shelf}
          eagerCount={si === 0 ? 4 : 0}
          reduceMotion={reduceMotion}
          onOpen={openPreview}
        />
      ))}

      {active && (
        <VideoPreviewDialog
          key={active.item.cid}
          item={active.item}
          onClose={closePreview}
          reduceMotion={reduceMotion}
        />
      )}
    </>
  )
}

function ShelfRow({
  shelf,
  eagerCount,
  reduceMotion,
  onOpen,
}: {
  shelf: Shelf
  eagerCount: number
  reduceMotion: boolean
  onOpen: (item: VideoDiscoveryItem, opener: HTMLElement | null) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const headingId = `video-shelf-${shelf.row}`

  // 棚単位の impression（初回可視時に1回だけ。カード単位では発火しない）
  useEffect(() => {
    const el = ref.current
    if (!el || shelf.items.length === 0) return
    let fired = false
    const fire = () => {
      if (fired) return
      fired = true
      trackEvent('video_catalog_impression', {
        source: VIDEO_DISCOVERY_SOURCE,
        row: shelf.row,
        count: shelf.items.length,
        entry: readEntry(),
      })
    }
    if (typeof IntersectionObserver === 'undefined') { fire(); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { fire(); io.disconnect() }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [shelf.row, shelf.items.length])

  if (shelf.items.length === 0) return null

  return (
    <section ref={ref} aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden="true" className="h-4 w-1 rounded-full bg-[var(--magenta)]" />
        <h2 id={headingId} className="text-sm font-black uppercase tracking-[0.2em] text-[var(--text)] sm:text-base">
          {shelf.label}
        </h2>
        <p className="text-[11px] text-[var(--text-muted)]">{shelf.sub}</p>
      </div>

      <ul className="-mx-4 flex gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:gap-4">
        {shelf.items.map((item, i) => (
          <li key={item.cid} className="w-36 shrink-0 snap-start sm:w-44 lg:w-48">
            <VideoCard item={item} eager={i < eagerCount} reduceMotion={reduceMotion} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function VideoCard({
  item,
  eager,
  reduceMotion,
  onOpen,
}: {
  item: VideoDiscoveryItem
  eager: boolean
  reduceMotion: boolean
  onOpen: (item: VideoDiscoveryItem, opener: HTMLElement | null) => void
}) {
  const badge = BADGE[item.row]
  const motion = reduceMotion
    ? ''
    : 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-105 motion-safe:group-focus-visible:scale-105'

  const body = (
    <>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] transition-[border-color,box-shadow] duration-200 group-hover:border-[var(--magenta)]/60 group-hover:shadow-[0_0_20px_rgba(226,0,116,0.25)] group-focus-visible:border-[var(--magenta)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--magenta)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--bg)]">
        <ProxiedImage
          src={item.imgSrc}
          alt={item.title}
          loading={eager ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover ${item.coverPos} ${motion}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" aria-hidden="true" />
        <span aria-hidden="true" className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest shadow-lg ${badge.className}`}>
          {badge.text}
        </span>
        {/* 動画プレビューの常時アフォーダンス（hover非依存＝Mobileでも見える）。
            カード自体の aria-label が「…のプレビューを開く」のため読み上げ重複を避けて aria-hidden。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-[9px] font-black tracking-[0.18em] text-white shadow-lg backdrop-blur-sm transition-colors duration-200 group-hover:border-transparent group-hover:bg-[var(--magenta)] group-focus-visible:border-transparent group-focus-visible:bg-[var(--magenta)]"
        >
          <span className="text-[var(--magenta)] transition-colors duration-200 group-hover:text-white group-focus-visible:text-white">▶</span>
          PREVIEW
        </span>
      </div>
      <div className="mt-2 space-y-1 px-0.5">
        <p className="text-[12px] font-medium leading-snug text-[var(--text)] line-clamp-2 group-hover:text-[var(--magenta)]">
          {item.title}
        </p>
        {item.actress && <p className="truncate text-[11px] text-[var(--text-muted)]">{item.actress}</p>}
        {item.releaseDate && <p className="text-[10px] text-[var(--text-muted)]">{item.releaseDate}</p>}
      </div>
    </>
  )

  const label = `${item.title} のプレビューを開く`
  const className = 'group block w-full text-left outline-none'

  // 作品ページがある場合は <a>（クローラー/新規タブ用）。通常操作ではプレビューを開く。
  if (item.slug) {
    return (
      <a
        href={`/verity/articles/${item.slug}`}
        aria-haspopup="dialog"
        aria-label={label}
        className={className}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          onOpen(item, e.currentTarget)
        }}
        onKeyDown={(e) => {
          if (e.key === ' ') {
            e.preventDefault()
            onOpen(item, e.currentTarget)
          }
        }}
      >
        {body}
      </a>
    )
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      className={className}
      onClick={(e) => onOpen(item, e.currentTarget)}
    >
      {body}
    </button>
  )
}
