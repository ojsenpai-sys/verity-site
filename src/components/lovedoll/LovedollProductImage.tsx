'use client'

import { useState } from 'react'
import { NowPrinting } from '@/components/NowPrinting'

// LOVE DOLL商品画像 — mono/goodsフロアのAPIレスポンスには imageURL.list(pt.jpg 90x120) /
// imageURL.small(ps.jpg 150x200) しか含まれないが、実際には pl.jpg(400x600)がCDN上に
// 実在する(Phase C.1で13CID全件を実URLで確認済み)。呼び出し側は imageURL.small(ps.jpg)を
// 渡すこと — 既存の画像プロキシの buildChain() は未認識floor(mono/store, mono/goods)の
// pl/ps/jp系サフィックスURLを常に pl→ps→jp の順で試すため、ps.jpg を渡すだけで
// プロキシ側が自動的に高解像度な pl.jpg を優先取得する(プロキシ自体は無改修)。
// videoaフロア専用の cidToCdnUrl は使わず、APIが返した実URLをそのまま渡す。
// 低解像度にフォールバックした場合でも無理に引き伸ばさないよう object-contain で縦横比を保持する。

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
