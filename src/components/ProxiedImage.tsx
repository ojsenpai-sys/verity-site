'use client'

import { useState } from 'react'
import { NowPrinting } from './NowPrinting'

type Props = {
  src:       string
  alt:       string
  className?: string
  /** 折り返し以下（週間ランキング等）では 'lazy' を指定して遅延読み込みする */
  loading?:  'lazy' | 'eager'
}

/** 画像読み込み失敗時に NowPrinting へ即座にフォールバック */
export function ProxiedImage({ src, alt, className, loading }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) return <NowPrinting />

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => setFailed(true)}
    />
  )
}
