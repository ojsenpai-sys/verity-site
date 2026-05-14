'use client'

import { useState } from 'react'
import { NowPrinting } from './NowPrinting'

type Props = {
  src:       string
  alt:       string
  className?: string
}

/** 画像読み込み失敗時に NowPrinting へ即座にフォールバック */
export function ProxiedImage({ src, alt, className }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) return <NowPrinting />

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
