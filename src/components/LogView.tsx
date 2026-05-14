'use client'

import { useEffect } from 'react'

type TargetType = 'genre' | 'actress' | 'article' | 'search' | 'sns'
type ActionType = 'click' | 'view' | 'search' | 'share'

type Props = {
  targetType:  TargetType
  targetId:    string
  actionType?: ActionType
}

/** ページ表示時にログAPIへ fire-and-forget する非表示コンポーネント */
export function LogView({ targetType, targetId, actionType = 'view' }: Props) {
  useEffect(() => {
    fetch('/verity/api/logs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ target_type: targetType, target_id: targetId, action_type: actionType }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
