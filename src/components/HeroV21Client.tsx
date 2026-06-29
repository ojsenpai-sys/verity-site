'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Flame } from 'lucide-react'
import { trackEvent } from '@/lib/analytics'
import { heroClickMeta, type HeroV21Item } from '@/lib/heroV21'
import { HeroV21MainStage } from './HeroV21MainStage'
import { HeroV21Thumb } from './HeroV21Thumb'

// ── Hero v2.1 — 急上昇TOP10 大型Hero（クライアント・オーケストレータ） ────────────
//
// 責務は「選択中Rankの状態保持」「切替の内部回遊計測」「レイアウト」のみ。
// 表示は MainStage（メイン）と Thumb（サムネ）へ委譲し、v2.2(動画)/v3(AI) はそれらを
// 差し替えるだけで拡張できる構成にしている。
//   計測 position:
//     hero_v21_main_image  メイン表紙（fanza_click・送客）        … MainStage
//     hero_v21_main_cta    メインCTA（fanza_click・送客）         … MainStage
//     hero_v21_rank_thumb  サムネ右下のFANZAショートカット（送客） … Thumb
//     hero_v21_rank_nav    サムネ本体タップでメイン切替（内部回遊） … 本コンポーネント
//   いずれも metadata に rank/points/title/actress/maker を送る（cid は target_id）。
// ※サンプル動画/AI切り抜き/閲覧人数は本フェーズ非対象（読み込まない）。

export function HeroV21Client({ items }: { items: HeroV21Item[] }) {
  const [selected, setSelected] = useState(0)

  // サムネ本体タップ = メイン切替（内部回遊・fanza_click を汚染しない別イベント）。
  // 依存なしの安定参照にして、切替時に全サムネのハンドラ同一性を保つ。
  const onSelect = useCallback((item: HeroV21Item, idx: number) => {
    setSelected(idx)
    trackEvent('hero_rank_select', {
      cid: item.cid,
      position: 'hero_v21_rank_nav',
      ...heroClickMeta(item),
    })
  }, [])

  const main = items[selected] ?? items[0]
  if (!main) return null

  return (
    <section
      id="hero"
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
            className="h-full w-full scale-150 object-cover object-center opacity-[0.08] blur-3xl"
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
        {/* Section heading */}
        <div className="mb-5 flex items-center justify-center gap-2.5 sm:justify-start">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
            <Flame size={13} className="text-amber-400" style={{ fill: 'rgba(251,191,36,0.45)' }} />
            Rising Now
          </span>
          <h2 className="text-[13px] font-bold text-[var(--text)] sm:text-sm">
            急上昇ランキング TOP{items.length}
          </h2>
        </div>

        {/* メインステージ（選択中Rank・最大表示） */}
        <HeroV21MainStage item={main} />

        {/* TOP10 サムネナビ（横スクロール・タップで切替） */}
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
