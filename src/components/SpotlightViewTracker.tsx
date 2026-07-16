'use client'

import { useEffect, useRef } from 'react'
import { trackEvent } from '@/lib/analytics'

type Props = {
  /** 特集 slug（例: "mens-esthe"） */
  slug: string
  /** 特集タイトル（例: "メンズエステ作品特集"） */
  title: string
  /** 掲載作品総数 */
  workCount: number
  /** 通常作品数 */
  normalWorkCount: number
  /** VR作品数 */
  vrWorkCount: number
}

/**
 * VERITY Spotlight 特集ページの表示計測。
 * `spotlight_view` を **1表示につき1回だけ** 送信する。
 * App Router の再レンダリングや React StrictMode の二重実行でも重複しないよう
 * useRef ガード + マウント時 useEffect で制御する。
 * どの Spotlight 特集でも props を差し替えるだけで再利用できる汎用設計。
 */
export function SpotlightViewTracker({
  slug,
  title,
  workCount,
  normalWorkCount,
  vrWorkCount,
}: Props) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackEvent('spotlight_view', {
      spotlight_slug: slug,
      spotlight_title: title,
      content_type: 'spotlight',
      work_count: workCount,
      normal_work_count: normalWorkCount,
      vr_work_count: vrWorkCount,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
