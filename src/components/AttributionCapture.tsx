'use client'

import { useEffect } from 'react'
import { VP_STORAGE_KEY } from '@/lib/social/attribution'

/**
 * X投稿からの着地時に URL の ?vp=<track_code> を sessionStorage へ退避する。
 * 以降の trackEvent が metadata.vp に合流させ、投稿単位の成果集計を可能にする。
 *
 * - null を返す計測専用コンポーネント（描画なし）。
 * - PageViewTracker より前にマウントし、初回 page_view にも vp が乗るようにする。
 */
export function AttributionCapture() {
  useEffect(() => {
    try {
      const vp = new URLSearchParams(window.location.search).get('vp')
      if (vp) sessionStorage.setItem(VP_STORAGE_KEY, vp.slice(0, 16))
    } catch {
      /* sessionStorage 不可（プライベートモード等）は無視 */
    }
  }, [])
  return null
}
