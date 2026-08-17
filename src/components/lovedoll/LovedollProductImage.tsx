'use client'

import { useState } from 'react'
import { NowPrinting } from '@/components/NowPrinting'

// LOVE DOLL商品画像 — mono/goodsフロアのAPIは imageURL.list / imageURL.small のみを返す(largeなし)。
// videoaフロア専用の cidToCdnUrl は使わず、APIが返した実URLをそのまま既存の画像プロキシ経由で表示する。
// 低解像度画像を無理に引き伸ばさないよう object-contain で縦横比を保持する。

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

export function LovedollProductImage({
  src,
  alt,
  className,
}: {
  src: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <NowPrinting className={className} />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyUrl(src)}
      alt={alt}
      loading="lazy"
      className={`h-full w-full object-contain ${className ?? ''}`}
      onError={() => setFailed(true)}
    />
  )
}
