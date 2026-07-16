'use client'

import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'

type Props = {
  /** 遷移先（UTM + ref 付き StoreOS LP URL） */
  href: string
  /** 発生元 Spotlight slug（例: "mens-esthe"） */
  slug: string
  /** 配置箇所識別子（既定: "industry_support"） */
  placement?: string
  /** 遷移先識別子（既定: "mens-esthe-lp"） */
  destination?: string
  className?: string
  children: ReactNode
}

/**
 * StoreOS 導線リンク。クリック時に `storeos_click` を **1クリック1回** 送信する。
 * 外部遷移のため target="_blank" + rel="noopener noreferrer" を維持。
 * 既存の fanza_click 等には一切影響しない独立イベント。
 */
export function StoreOsCtaLink({
  href,
  slug,
  placement = 'industry_support',
  destination = 'mens-esthe-lp',
  className,
  children,
}: Props) {
  function handleClick() {
    trackEvent('storeos_click', {
      source: 'verity',
      content_type: 'spotlight',
      spotlight_slug: slug,
      placement,
      destination,
    })
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}
