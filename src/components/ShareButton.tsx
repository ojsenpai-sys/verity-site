'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'

type Props = {
  url:   string
  title: string
  className?: string
}

export function ShareButton({ url, title, className }: Props) {
  const [shared, setShared] = useState(false)

  async function handleShare() {
    const fullUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'}${url}`
    const tweetText = encodeURIComponent(`${title} | VERITY`)
    const tweetUrl  = encodeURIComponent(fullUrl)
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`, '_blank', 'noopener')

    // ログ記録 + digital_bard 二つ名付与
    await Promise.all([
      fetch('/verity/api/logs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ target_type: 'sns', target_id: url, action_type: 'share' }),
      }).catch(() => {}),
      fetch('/verity/api/epithets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: ['digital_bard'] }),
      }).catch(() => {}),
    ])

    setShared(true)
    setTimeout(() => setShared(false), 2500)
  }

  return (
    <button
      onClick={handleShare}
      className={className ?? [
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5',
        'text-xs text-[var(--text-muted)] border-[var(--border)]',
        'hover:border-sky-500/50 hover:text-sky-400 transition-colors',
      ].join(' ')}
    >
      {shared ? <Check size={12} className="text-emerald-400" /> : <Share2 size={12} />}
      {shared ? 'シェアしました' : 'シェア'}
    </button>
  )
}
