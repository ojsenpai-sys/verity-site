'use client'

import { memo } from 'react'
import { Play } from 'lucide-react'
import { FanzaLink } from './FanzaLink'
import { RANK_STYLE, heroClickMeta, type HeroV21Item } from '@/lib/heroV21'

// Hero v2.1 サムネ1枚。本体タップ＝メイン切替（onSelect）、右下チップ＝直接FANZA送客。
// memo 化し、選択切替時に isActive が変化する2枚だけ再描画させる（不要な再レンダリング抑制）。

type Props = {
  item:     HeroV21Item
  index:    number
  isActive: boolean
  onSelect: (item: HeroV21Item, index: number) => void
}

function HeroV21ThumbImpl({ item, index, isActive, onSelect }: Props) {
  const style = RANK_STYLE[item.rank]

  return (
    <div className={item.rank <= 3 ? 'w-[104px] shrink-0 snap-start sm:w-[120px]' : 'w-[88px] shrink-0 snap-start sm:w-[100px]'}>
      <div className="relative">
        {/* 本体タップ = メイン切替（hero_v21_rank_nav） */}
        <button
          type="button"
          onClick={() => onSelect(item, index)}
          aria-pressed={isActive}
          aria-label={`第${item.rank}位 ${item.title} を主役表示`}
          className={[
            'group/thumb relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-[var(--surface-2)] ring-1 transition-all',
            isActive
              ? 'ring-2 ring-[var(--magenta)] ring-offset-2 ring-offset-[var(--surface)]'
              : style?.ring ?? 'ring-[var(--border)]',
          ].join(' ')}
        >
          {item.imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imgSrc}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className={`absolute inset-0 h-full w-full object-cover ${item.coverPos} transition-transform duration-300 group-hover/thumb:scale-105 ${isActive ? '' : 'opacity-85'}`}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[9px] text-[var(--text-muted)]">
              NOW PRINTING
            </div>
          )}
          {/* 順位バッジ */}
          <span
            className={[
              'absolute left-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black shadow-lg',
              style?.badge ?? 'border border-white/20 bg-black/70 text-white',
            ].join(' ')}
          >
            {item.rank}
          </span>
          {/* 選択中インジケータ */}
          {isActive && (
            <span className="absolute inset-x-0 bottom-0 bg-[var(--magenta)] py-0.5 text-center text-[9px] font-black text-white">
              主役表示中
            </span>
          )}
        </button>

        {/* 右下 FANZA ショートカット = 直接送客（hero_v21_rank_thumb）。button の兄弟要素に
            置きバブリングを避ける（チップtapで切替が発火しない）。 */}
        {item.fanzaUrl && !isActive && (
          <FanzaLink
            href={item.fanzaUrl}
            targetId={item.cid}
            position="hero_v21_rank_thumb"
            meta={heroClickMeta(item)}
            ariaLabel={`第${item.rank}位 ${item.title} をFANZAで見る`}
            className="absolute bottom-1 right-1 z-20 inline-flex items-center gap-0.5 rounded-full bg-black/65 px-1.5 py-0.5 text-[9px] font-bold text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-[var(--magenta)]"
          >
            <Play size={8} className="fill-white" /> FANZA
          </FanzaLink>
        )}
      </div>

      {/* タイトル/女優 */}
      <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-snug text-[var(--text)]">
        {item.title}
      </p>
      {item.actress && (
        <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--text-muted)]">{item.actress}</p>
      )}
    </div>
  )
}

export const HeroV21Thumb = memo(HeroV21ThumbImpl)
