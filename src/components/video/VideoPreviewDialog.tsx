'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X } from 'lucide-react'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { catalogMeta, fanzaPosition } from '@/lib/videoDiscoverySelection.mjs'
import type { VideoDiscoveryItem } from '@/lib/videoDiscovery'

// VIDEO DISCOVERY のプレビュー（FANZA公式 litevideo iframe を加工せずそのまま表示）。
//
// - iframe はこのダイアログが開いている間だけ存在する（親が同時に1つしか描画しない＝最大1）。
//   別作品を開くと親が key=cid で再マウントするため、前の iframe は必ずアンマウントされる。
// - litevideo のプレイヤーは固定ピクセル（size=720_480 で内側に余白含む約740x500）で描画され、
//   それより小さい枠ではプレイヤー内にスクロールバーが出る。そのため iframe 自体は
//   ネイティブサイズで置き、表示だけ CSS transform で枠幅に縮小する（中身は加工しない）。
// - クロスオリジンのため再生状態・ミュートは制御/取得できない。自動再生は要求しない。
// - 読み込みタイムアウト / タブ非表示時は iframe を外し、ポスター＋CTA にフォールバックする
//   （動画再生そのものを必須条件にしない）。
// - ダイアログは document.body へ portal する（呼び出し元の space-y-* 等のレイアウト/スタッキング
//   コンテキストの影響を受けないため）。ユーザー操作後にのみ描画されるため SSR には現れない。

const NATIVE_W = 740
const NATIVE_H = 500
const LOAD_TIMEOUT_MS = 12_000

// Desktop(sm+) のダイアログ幅。動画を主役にするため最大 760px（≒ネイティブ 740px）まで広げつつ、
//   - 横: 左右余白(sm:p-6 = 24px×2)を引いた幅
//   - 縦: ビューポート高から上下余白(48px)と情報欄(タイトル2行/メタ/CTA/PR 実測≒180px＋余裕 → 210px)を引いた高さに
//         動画アスペクト(740/500)を掛けた幅
// の最小値に収める（小さい Desktop viewport でもダイアログ全体が画面内に収まる）。
const DESKTOP_DIALOG_WIDTH = `min(760px, calc(100vw - 48px), calc((100dvh - 48px - 210px) * ${NATIVE_W / NATIVE_H}))`

export type CloseReason = 'close_button' | 'escape' | 'backdrop' | 'article_cta'

type Phase = 'loading' | 'ready' | 'failed' | 'suspended'

const FOCUSABLE = 'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'

export function VideoPreviewDialog({
  item,
  onClose,
  reduceMotion,
}: {
  item: VideoDiscoveryItem
  onClose: (reason: CloseReason) => void
  reduceMotion: boolean
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [scale, setScale] = useState(0)

  // 初期フォーカス＋背面スクロール停止
  useEffect(() => {
    closeRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Escape で閉じる / Tab をダイアログ内に閉じ込める
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose('escape')
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }, [onClose])

  // 枠幅に合わせた縮小率
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / NATIVE_W)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 読み込みタイムアウト → ポスター＋CTA へフォールバック
  useEffect(() => {
    if (phase !== 'loading') return
    const t = setTimeout(() => setPhase('failed'), LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [phase])

  // タブ非表示になったら iframe を外して再生を止める（戻ったら明示操作で再読み込み）
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        setPhase(p => (p === 'loading' || p === 'ready' ? 'suspended' : p))
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const playerMounted = phase === 'loading' || phase === 'ready'
  const meta = catalogMeta(item.row, item.position)
  const anim = reduceMotion ? '' : 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'
  // プレイヤー読込完了時のフェード（reduce-motion / Save-Data では即時切替）
  const fade = reduceMotion ? '' : 'motion-safe:transition-opacity motion-safe:duration-300'

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/75 sm:items-center sm:p-6 ${anim}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose('backdrop') }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        // Mobile: 横幅いっぱいの bottom sheet（左右ボーダーなし＝動画を端まで使う）。
        // Desktop: DESKTOP_DIALOG_WIDTH で動画中心の中央ダイアログ。
        style={{ ['--vd-dialog-w' as string]: DESKTOP_DIALOG_WIDTH }}
        className="relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:w-[var(--vd-dialog-w)] sm:max-h-[calc(100dvh-48px)] sm:rounded-2xl sm:border"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={() => onClose('close_button')}
          aria-label="プレビューを閉じる"
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--magenta)]"
        >
          <X size={20} aria-hidden="true" />
        </button>

        {/* ── プレイヤー（ネイティブサイズ iframe を枠幅へ縮小表示） ── */}
        <div
          ref={stageRef}
          className="relative w-full overflow-hidden bg-black sm:rounded-t-2xl"
          style={{ aspectRatio: `${NATIVE_W} / ${NATIVE_H}` }}
        >
          {/* ポスター（読み込み中・フォールバック時の表示）。読込完了時はポスターをフェードアウト、
              プレイヤーをフェードインのクロスフェードにする（即時消失→黒画面の点滅を避ける）。
              litevideo ページはプレイヤー周囲が透過のため、ready 後もポスターを残すと縁に透けて見える。 */}
          <ProxiedImage
            src={item.imgSrc}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${item.coverPos} ${fade} ${phase === 'ready' ? 'opacity-0' : 'opacity-40'}`}
          />

          {playerMounted && scale > 0 && (
            <iframe
              src={item.sampleMovieUrl}
              title={`${item.title} サンプル動画`}
              width={NATIVE_W}
              height={NATIVE_H}
              allow="encrypted-media; fullscreen"
              allowFullScreen
              loading="lazy"
              onLoad={() => setPhase(p => (p === 'loading' ? 'ready' : p))}
              className={`absolute left-0 top-0 border-0 ${fade} ${phase === 'ready' ? 'opacity-100' : 'opacity-0'}`}
              style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}
            />
          )}

          {phase === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p
                className={`rounded-full bg-black/60 px-4 py-1.5 text-[11px] font-bold tracking-wider text-white/90 ${reduceMotion ? '' : 'motion-safe:animate-pulse'}`}
                aria-live="polite"
              >
                プレビューを読み込み中…
              </p>
            </div>
          )}

          {(phase === 'failed' || phase === 'suspended') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-bold text-white" aria-live="polite">
                {phase === 'failed' ? 'プレビューを読み込めませんでした' : 'プレビューを停止しました'}
              </p>
              <button
                type="button"
                onClick={() => setPhase('loading')}
                className="rounded-full border border-white/50 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/10"
              >
                プレビューを再読み込み
              </button>
            </div>
          )}
        </div>

        {/* ── 作品情報＋CTA ── */}
        <div
          className="space-y-4 px-4 pt-4 sm:space-y-3.5 sm:px-6 sm:pt-5"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          <div className="space-y-1.5">
            <h2 id={titleId} className="text-base font-bold leading-snug text-[var(--text)] line-clamp-3 sm:text-lg">
              {item.title}
            </h2>
            {(item.actress || item.releaseDate) && (
              <p className="text-xs text-[var(--text-muted)]">
                {item.actress}
                {item.actress && item.releaseDate && <span className="mx-1.5">·</span>}
                {item.releaseDate && <span>{item.releaseDate} 発売</span>}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            {item.slug && (
              <Link
                href={`/verity/articles/${item.slug}`}
                onClick={() => onClose('article_cta')}
                className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border-2 border-[var(--magenta)] px-6 py-3 text-sm font-bold text-[var(--magenta)] transition-colors hover:bg-[var(--magenta)]/10"
              >
                作品を見る
              </Link>
            )}
            {item.fanzaUrl && (
              <FanzaLink
                href={item.fanzaUrl}
                targetId={item.cid}
                position={fanzaPosition(item.row)}
                meta={meta}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-6 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.3)] transition-all hover:brightness-110"
              >
                FANZAで見る
                <span className="opacity-70" aria-hidden="true">↗</span>
              </FanzaLink>
            )}
          </div>

          <p className="text-[10px] text-[var(--text-muted)]">
            <span className="rounded border border-[var(--magenta)]/30 bg-[var(--magenta)]/15 px-1.5 py-0.5 font-bold tracking-widest text-[var(--magenta)]">PR</span>
            {' '}サンプル動画はFANZA公式プレイヤーで再生されます。
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
