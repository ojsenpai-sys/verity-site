'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackEvent } from '@/lib/analytics'
import type { EventName, TrackPayload } from '@/lib/analytics'

type Props = {
  href:      string
  eventName: EventName
  payload:   TrackPayload
  className?: string
  children:  ReactNode
}

/** 内部リンクに trackEvent を仕込むシン・クライアントラッパー */
export function TrackedLink({ href, eventName, payload, className, children }: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackEvent(eventName, payload)}
    >
      {children}
    </Link>
  )
}
