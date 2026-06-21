'use client'

import { useEffect } from 'react'

type Props = {
  url: string
  label?: string
}

declare global {
  interface Window {
    twttr?: { widgets?: { load?: () => void } }
  }
}

export function TweetEmbedBlock({ url, label }: Props) {
  useEffect(() => {
    if (window.twttr?.widgets?.load) {
      window.twttr.widgets.load()
      return
    }
    if (document.querySelector('script[src*="platform.twitter.com/widgets"]')) return
    const s = document.createElement('script')
    s.src = 'https://platform.twitter.com/widgets.js'
    s.async = true
    s.charset = 'utf-8'
    document.body.appendChild(s)
  }, [])

  return (
    <div className="overflow-hidden rounded-xl border border-[#d4af37]/20 bg-black/35 p-4 backdrop-blur-sm">
      {label && (
        <p className="mb-3 text-[10px] font-bold tracking-wider text-[#d4af37]/50 uppercase">{label}</p>
      )}
      {/* Twitter Embed — data-theme="dark" でダークテーマ適用 */}
      <blockquote
        className="twitter-tweet"
        data-dnt="true"
        data-theme="dark"
        data-lang="ja"
      >
        <a href={url.replace('x.com', 'twitter.com')}>投稿を読み込み中…</a>
      </blockquote>
    </div>
  )
}
