'use client'

import type { ReactNode } from 'react'

type Props = {
  href:        string
  targetId:    string
  actionType?: 'purchase_click' | 'reserve_click'
  className?:  string
  children:    ReactNode
}

/**
 * 購入・予約リンク。クリック時に sn_user_logs へ非同期記録してから遷移。
 * ログ失敗時もナビゲーションはブロックしない。
 */
export function PurchaseLink({
  href, targetId, actionType = 'purchase_click', className, children,
}: Props) {
  function handleClick() {
    fetch('/verity/api/logs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        target_type: 'actress',
        target_id:   targetId,
        action_type: actionType,
      }),
    }).catch(() => {/* fire-and-forget */})
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
