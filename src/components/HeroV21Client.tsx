'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Flame, Pause, Play } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'
import { heroClickMeta, autoSlideMeta, AUTO_SLIDE_MS, type HeroV21Item } from '@/lib/heroV21'
import { HeroV21MainStage } from './HeroV21MainStage'
import { HeroV21Thumb } from './HeroV21Thumb'

// ── Hero v2.1 — 急上昇TOP10 大型Hero（クライアント・オーケストレータ） ────────────
//
// 責務は「選択中Rankの状態保持」「自動カルーセル送り」「切替の内部回遊計測」「レイアウト」。
// 表示は MainStage（メイン）と Thumb（サムネ）へ委譲する。
//   計測 position:
//     hero_v21_main_image  メイン表紙（fanza_click・送客）        … MainStage
//     hero_v21_main_cta    メインCTA（fanza_click・送客）         … MainStage
//     hero_v21_rank_thumb  サムネ右下のFANZAショートカット（送客） … Thumb
//     hero_v21_rank_nav    サムネ本体タップでメイン切替（内部回遊） … 本コンポーネント
//     hero_v21_autocarousel 画像自動カルーセル（Phase C）          … 本コンポーネント
//
// Auto Preview Carousel（Phase C・mp4不使用）:
//   既存 main の selected を AUTO_SLIDE_MS ごとに自動送りし TOP10 を循環（画像のみ）。
//   停止条件: 手動railタップ / 一時停止トグル / hover・focus・touch / プレビュー表示中 /
//             Hero画面外 / タブ非表示 / prefers-reduced-motion。
//   計測 hero_auto_slide_view は「1PV内で各cid初回表示時のみ」発火（ループ再発火なし）。
//   既存の fanza_click / hero_rank_select は一切変更しない（回帰なし）。

export function HeroV21Client({ items }: { items: HeroV21Item[] }) {
  // 初期 main は「動画あり最上位」を優先（無ければ rank#1）。自動送りの開始スライドを兼ねる。
  const [selected, setSelected] = useState(() => {
    const i = items.findIndex(item => item.sampleMovieUrl)
    return i >= 0 ? i : 0
  })

  // ── 自動カルーセル制御 ────────────────────────────────────────────────────────
  const [autoPlay, setAutoPlay]           = useState(true)  // マスターON/OFF（トグル・railタップでOFF）
  const [inViewport, setInViewport]       = useState(true)  // Heroが画面内か
  const [tabHidden, setTabHidden]         = useState(false) // タブ非表示か
  const [hovered, setHovered]             = useState(false) // hover/focus/touch中か（一時停止）
  const [previewActive, setPreviewActive] = useState(false) // 15秒プレビュー表示中か
  const [reducedMotion, setReducedMotion] = useState(false)

  const sectionRef   = useRef<HTMLElement>(null)
  const loopCountRef = useRef(0)                 // TOP10を何周したか
  const seenCidsRef  = useRef<Set<string>>(new Set()) // slide_view 重複排除（PV内・cid単位）

  const canAuto = items.length > 1 && !reducedMotion
  const running = autoPlay && canAuto && inViewport && !tabHidden && !hovered && !previewActive

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Hero が画面内かどうか（画面外では自動送り・計測を止める）
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setInViewport(true); return }
    const io = new IntersectionObserver(([e]) => setInViewport(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // タブ非表示（裏タブ）では止める
  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === 'hidden')
    onVis()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // 自動送り本体
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setSelected(prev => {
        const next = (prev + 1) % items.length
        if (next === 0) loopCountRef.current += 1
        return next
      })
    }, AUTO_SLIDE_MS)
    return () => clearInterval(id)
  }, [running, items.length])

  // slide_view — 1PV内で各cid初回表示時のみ・可視時のみ（過剰発火防止）
  useEffect(() => {
    if (!inViewport || tabHidden) return
    const item = items[selected]
    if (!item || seenCidsRef.current.has(item.cid)) return
    seenCidsRef.current.add(item.cid)
    trackEvent('hero_auto_slide_view', { cid: item.cid, ...autoSlideMeta(item, selected, loopCountRef.current) })
  }, [selected, inViewport, tabHidden, items])

  // サムネ本体タップ = メイン切替（手動操作 → 自動送り停止・トグルで再開可）。
  const onSelect = useCallback((item: HeroV21Item, idx: number) => {
    setSelected(idx)
    setAutoPlay(false)
    trackEvent('hero_rank_select', {
      cid: item.cid,
      position: 'hero_v21_rank_nav',
      ...heroClickMeta(item),
    })
  }, [])

  const main = items[selected] ?? items[0]
  if (!main) return null

  // カルーセル文脈のFANZAクリック補助計測（既存 fanza_click は FanzaLink 側で必ず発火）。
  const fireAutoFanza = () =>
    trackEvent('hero_auto_fanza_click', { cid: main.cid, ...autoSlideMeta(main, selected, loopCountRef.current) })

  return (
    <section
      id="hero"
      ref={sectionRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
      className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
    >
      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--magenta)]/70 via-amber-400/30 to-transparent" />

      {/* Faint blurred cover for cinematic immersion */}
      {main.imgSrc && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={main.imgSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full scale-150 object-cover object-center opacity-[0.08] blur-3xl transition-opacity duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--surface)] via-[var(--surface)]/92 to-[var(--surface)]/55" />
        </div>
      )}

      {/* Atmospheric drifting glow blob */}
      <div
        aria-hidden="true"
        className="drift pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[var(--magenta)]/20 blur-3xl"
      />

      <div className="relative p-5 sm:p-8">
        {/* Section heading + 自動送り 再生/一時停止トグル */}
        <div className="mb-5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
              <Flame size={13} className="text-amber-400" style={{ fill: 'rgba(251,191,36,0.45)' }} />
              Rising Now
            </span>
            <h2 className="text-[13px] font-bold text-[var(--text)] sm:text-sm">
              急上昇ランキング TOP{items.length}
            </h2>
          </div>
          {canAuto && (
            <button
              type="button"
              onClick={() => setAutoPlay(p => !p)}
              aria-label={autoPlay ? '自動切替を一時停止' : '自動切替を再生'}
              aria-pressed={autoPlay}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]"
            >
              {autoPlay ? <Pause size={13} /> : <Play size={13} className="translate-x-px" />}
            </button>
          )}
        </div>

        {/* メインステージ（選択中Rank・最大表示。自動送りで循環） */}
        <HeroV21MainStage
          item={main}
          onFanzaAuto={fireAutoFanza}
          onPreviewActiveChange={setPreviewActive}
        />

        {/* TOP10 サムネナビ（横スクロール・タップで切替＝自動送り停止） */}
        <div className="mt-6 border-t border-[var(--border)] pt-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-[var(--text-muted)]">
              タップで主役を切り替え
            </span>
            <Link
              href="/verity/ranking"
              className="text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--magenta)]"
            >
              すべて見る →
            </Link>
          </div>

          <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 [scrollbar-width:thin]">
            {items.map((item, idx) => (
              <HeroV21Thumb key={item.cid} item={item} index={idx} isActive={idx === selected} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
