'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { trackEvent } from '@/lib/analytics'

type Props = {
  href: string
  /** 対象 Spotlight の slug */
  slug: string
  /** 流入元・流出先の識別子（analytics.ts の spotlight_click コメント参照） */
  placement: string
  /** 遷移先の補足識別子（作品CID・女優external_id など） */
  destination?: string
  className?: string
  ariaLabel?: string
  /** 補助処理（任意）。spotlight_click 発火の「後」に呼ばれる（例: ドロワーを閉じる）。 */
  onClick?: () => void
  children: ReactNode
}

/**
 * Spotlight 導線のサイト内リンク。クリック時に `spotlight_click` を発火する。
 * 遷移先ページ側の video_view / actress_view は従来どおり別途記録されるため、
 * 本コンポーネントは「どこから入ったか」を補うだけの補助計測に徹する。
 * next/link を包むので、ソフトナビゲーション・prefetch の挙動は変わらない。
 */
export function SpotlightLink({
  href,
  slug,
  placement,
  destination,
  className,
  ariaLabel,
  onClick,
  children,
}: Props) {
  function handleClick() {
    trackEvent('spotlight_click', {
      spotlight_slug: slug,
      placement,
      ...(destination ? { destination } : {}),
    })
    onClick?.()
  }

  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </Link>
  )
}
