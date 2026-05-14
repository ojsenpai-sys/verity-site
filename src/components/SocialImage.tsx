'use client'

import { useState } from 'react'
import { NowPrinting } from './NowPrinting'

type Props = {
  src: string
  alt: string
  className?: string
}

export function SocialImage({ src, alt, className }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) return <NowPrinting className={className} />

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
