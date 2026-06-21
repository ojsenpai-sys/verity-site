'use client'

import { useEffect } from 'react'

interface Props {
  genreTags: string[]
  weight:    number  // 1 = view, 5 = fav
}

/** ページ表示時にジャンルスコアを加算する非表示コンポーネント (fire-and-forget) */
export function GenreScoreTracker({ genreTags, weight }: Props) {
  useEffect(() => {
    if (genreTags.length === 0) return
    fetch('/verity/api/genre-scores', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tags: genreTags, weight }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
