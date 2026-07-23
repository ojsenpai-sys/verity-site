'use client'

import Link from 'next/link'
import { useRef, type ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'

type Props = {
  href:          string
  /** 女優 external_id（例: 'dmm-actress-1044864'）→ target_id にマップ。 */
  actressId:     string
  /** 女優名 → metadata.actressName（= target 名）。 */
  actressName:   string
  /** クリック導線 placement（work_hero_actress など）→ metadata.position。 */
  position:      string
  /** 遷移元の作品 CID（external_id）。 */
  sourceCid?:    string | null
  /** 遷移元の作品 slug。 */
  sourceSlug?:   string
  /** リスト内インデックス（chip / card の並び順）。 */
  slot?:         number
  /** 作品の出演女優数。 */
  actressCount?: number
  /** 導線種別（hero / profile_cta / same_actress_section / same_actress_card）。 */
  sectionType?:  string
  className?:    string
  ariaLabel?:    string
  children:      ReactNode
}

/**
 * 女優ページへの内部リンク＋ actress_click 計測（計測専用イベント）。
 *
 *  - クリック時に fire-and-forget で actress_click を送る。送信は try/catch で保護し、
 *    失敗しても next/link の通常遷移を妨げない。
 *  - 二重送信防止: 同一要素の 500ms 以内の連続発火を無視する（誤タップ / StrictMode 対策）。
 *  - is_active_event()（Human v3 能動判定）には含まれないため v3 ロジックに影響しない。
 */
export function ActressLink({
  href,
  actressId,
  actressName,
  position,
  sourceCid,
  sourceSlug,
  slot,
  actressCount,
  sectionType,
  className,
  ariaLabel,
  children,
}: Props) {
  const lastFiredRef = useRef(0)

  function handleClick() {
    const now = Date.now()
    if (now - lastFiredRef.current < 500) return // 二重送信防止
    lastFiredRef.current = now
    try {
      trackEvent('actress_click', {
        actressId,
        actressName,
        position,
        ...(sourceCid       ? { source_cid: sourceCid }        : {}),
        ...(sourceSlug      ? { source_slug: sourceSlug }      : {}),
        ...(slot != null    ? { slot }                         : {}),
        ...(actressCount != null ? { actress_count: actressCount } : {}),
        ...(sectionType     ? { section_type: sectionType }    : {}),
      })
    } catch {
      /* 計測失敗は遷移を妨げない */
    }
  }

  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </Link>
  )
}
