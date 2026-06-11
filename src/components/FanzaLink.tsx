'use client'

import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'

type Props = {
  href:      string
  targetId:  string
  /** 明示的に渡された position が最優先。未指定の場合は href から自動判定。 */
  position?: string
  className?: string
  children:  ReactNode
}

/**
 * href の URL 構造からフォールバック position を導出する。
 * 明示的に position が渡されている場合は呼ばれない。
 */
function derivePosition(href: string): string {
  if (href.includes('/mono/dvd/') || href.includes('mono/dvd')) return 'dvd_single'
  return 'digital_single'
}

/** FANZA アフィリエイトリンク — クリック時に fanza_click イベントを発火 */
export function FanzaLink({ href, targetId, position, className, children }: Props) {
  function handleClick() {
    // 明示的 position > URL フォールバック の優先順位を保証する
    const resolvedPosition = position ?? derivePosition(href)
    trackEvent('fanza_click', { cid: targetId, position: resolvedPosition })
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}
