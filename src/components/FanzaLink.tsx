'use client'

import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'

type Props = {
  href:      string
  targetId:  string
  /** 明示的に渡された position が最優先。未指定の場合は href から自動判定。 */
  position?: string
  /** 追加の計測メタデータ（rank 等）。trackEvent の payload にマージされ metadata JSONB に格納される。 */
  meta?:     Record<string, unknown>
  className?: string
  /** スクリーンリーダー向けラベル（画像のみ/アイコンのみリンクで使用）。 */
  ariaLabel?: string
  /**
   * 補助的な追加処理（任意）。fanza_click 発火の「後」に呼ばれる。
   * 例: Hero プレビューCTAで hero_preview_fanza_click を併発する用途。
   * ここを使っても既存の fanza_click 計測は必ず先に発火するため壊れない。
   */
  onClick?:  () => void
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
export function FanzaLink({ href, targetId, position, meta, className, ariaLabel, onClick, children }: Props) {
  function handleClick() {
    // 明示的 position > URL フォールバック の優先順位を保証する
    const resolvedPosition = position ?? derivePosition(href)
    trackEvent('fanza_click', { cid: targetId, position: resolvedPosition, ...meta })
    onClick?.()
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}
