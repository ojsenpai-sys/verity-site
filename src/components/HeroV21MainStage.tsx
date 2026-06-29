'use client'

import Link from 'next/link'
import { Flame, Play } from 'lucide-react'
import { FanzaLink } from './FanzaLink'
import { RANK_STYLE, heroClickMeta, type HeroV21Item } from '@/lib/heroV21'

// Hero v2.1 メインステージ（選択中Rankの大型表示）。
// v2.2（動画）はこの表紙領域に sample 動画を差し込む拡張ポイント。表示ロジックを
// ここに閉じ込めることで、オーケストレータ（HeroV21Client）の責務を切替＋計測に限定する。

/** メイン表紙。LCP対象のため fetchPriority=high・遅延読み込みしない。 */
function MainCover({ item, highlight }: { item: HeroV21Item; highlight?: string }) {
  return (
    <div
      className={[
        'relative aspect-[2/3] w-[170px] overflow-hidden rounded-xl shadow-[0_18px_56px_rgba(0,0,0,0.70)] ring-1 transition-transform duration-300 group-hover/hmain:scale-[1.03] sm:w-[230px] lg:w-[260px]',
        highlight ?? 'ring-[var(--border)]',
      ].join(' ')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imgSrc ?? ''}
        alt={item.title}
        fetchPriority="high"
        decoding="async"
        className={`absolute inset-0 h-full w-full object-cover ${item.coverPos}`}
      />
      {/* 常設 FANZA バッジ＋hoverオーバーレイ */}
      <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors group-hover/hmain:bg-[var(--magenta)]/90">
        <Play size={9} className="fill-white" /> FANZA
      </span>
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover/hmain:bg-black/55 md:flex">
        <span className="translate-y-1 scale-95 rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-bold text-gray-900 opacity-0 shadow-lg transition-all duration-200 group-hover/hmain:translate-y-0 group-hover/hmain:scale-100 group-hover/hmain:opacity-100">
          ▶ FANZAで観る
        </span>
      </div>
    </div>
  )
}

export function HeroV21MainStage({ item }: { item: HeroV21Item }) {
  const badge = RANK_STYLE[item.rank]
  const meta  = heroClickMeta(item)
  const ctaLabel = `第${item.rank}位 ${item.title} をFANZAで見る`

  return (
    <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-9 sm:text-left">
      {/* Cover image → FANZA（hero_v21_main_image） */}
      {item.imgSrc && (
        item.fanzaUrl ? (
          <FanzaLink
            href={item.fanzaUrl}
            targetId={item.cid}
            position="hero_v21_main_image"
            meta={meta}
            ariaLabel={ctaLabel}
            className="group/hmain relative block shrink-0"
          >
            <MainCover item={item} highlight={badge?.ring} />
          </FanzaLink>
        ) : (
          <div className="relative block shrink-0">
            <MainCover item={item} highlight={badge?.ring} />
          </div>
        )
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-col items-center gap-3.5 sm:items-start">
        {/* Rank badge */}
        <span
          className={[
            'inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
            item.rank <= 3
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
              : 'border-[var(--magenta)]/30 bg-[var(--magenta)]/10 text-[var(--magenta)]',
          ].join(' ')}
        >
          急上昇 第{item.rank}位
          <span className="inline-flex items-center gap-0.5 text-amber-300/90">
            <Flame size={10} className="fill-amber-400 text-amber-400" />
            {item.points.toLocaleString()}
          </span>
        </span>

        {/* Title */}
        <h2 className="line-clamp-2 max-w-[44ch] text-lg font-bold leading-snug tracking-tight text-[var(--text)] sm:text-[26px]">
          {item.title}
        </h2>

        {/* Meta row: 女優 ・ メーカー ・ 発売日 */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] sm:justify-start">
          {item.actress && (
            item.actressId && item.actressId > 0 ? (
              <Link
                href={`/verity/actresses/dmm-actress-${item.actressId}`}
                className="font-bold text-[var(--magenta)] transition-colors hover:underline"
              >
                {item.actress}
              </Link>
            ) : (
              <span className="font-bold text-[var(--magenta)]">{item.actress}</span>
            )
          )}
          {item.maker && (
            <span className="text-[var(--text-muted)]">
              <span className="opacity-60">メーカー </span>{item.maker}
            </span>
          )}
          {item.releaseDate && (
            <span className="text-[var(--text-muted)]">
              <span className="opacity-60">発売 </span>{item.releaseDate}
            </span>
          )}
        </div>

        {/* CTA → FANZA（hero_v21_main_cta） */}
        {item.fanzaUrl && (
          <FanzaLink
            href={item.fanzaUrl}
            targetId={item.cid}
            position="hero_v21_main_cta"
            meta={meta}
            className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-7 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.42)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(226,0,116,0.65)] hover:brightness-110 active:scale-[0.97]"
          >
            ▶ 今すぐFANZAで見る
            <span className="opacity-70">↗</span>
          </FanzaLink>
        )}
      </div>
    </div>
  )
}
