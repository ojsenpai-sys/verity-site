'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { withAffiliate } from '@/lib/affiliate'
import { FanzaLink } from './FanzaLink'

interface AlertPayload {
  title:        string
  actressName:  string
  articleSlug:  string | null
  externalId:   string
  imageUrl:     string | null
  affiliateUrl: string | null
}

const DISMISS_KEY = () => `verity_fav_alert_${new Date().toDateString()}`

export function FavNewReleaseAlert() {
  const [payload, setPayload] = useState<AlertPayload | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY())) return

    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('favorite_actress_ids')
        .eq('id', user.id)
        .maybeSingle()

      const ids: string[] = profile?.favorite_actress_ids ?? []
      if (!ids.length) return

      // actress slugs → names via actresses table
      const { data: actresses } = await supabase
        .from('actresses')
        .select('id, name, slug')
        .in('slug', ids)
        .limit(50)

      if (!actresses?.length) return

      const names = actresses.map((a: { name: string }) => a.name)
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const now    = new Date().toISOString()

      const { data: articles } = await supabase
        .from('articles')
        .select('title, slug, external_id, image_url, metadata, published_at, tags')
        .eq('is_active', true)
        .overlaps('tags', names)
        .gte('published_at', cutoff)
        .lte('published_at', now)
        .order('published_at', { ascending: false })
        .limit(1)

      if (!articles?.length) return

      const art = articles[0]
      const meta = (art.metadata ?? {}) as Record<string, unknown>
      const rawUrl = (meta.affiliate_url ?? meta.url) as string | null
      const affiliateUrl = withAffiliate(rawUrl)

      // match which actress triggered this
      const artTags: string[] = art.tags ?? []
      const matched = names.find((n: string) => artTags.includes(n)) ?? names[0]

      setPayload({
        title:        art.title,
        actressName:  matched,
        articleSlug:  art.slug ?? null,
        externalId:   art.external_id,
        imageUrl:     art.image_url ?? null,
        affiliateUrl,
      })
      // slight delay so it doesn't flash on initial load
      setTimeout(() => setVisible(true), 1800)
    }

    load()
  }, [])

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY(), '1')
    setVisible(false)
  }

  if (!payload || !visible) return null

  const proxyImg = payload.imageUrl
    ? `/api/proxy/image?url=${encodeURIComponent(payload.imageUrl)}`
    : null

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex w-[300px] flex-col gap-2 rounded-xl border border-[var(--magenta)]/40 bg-[var(--surface)] p-3 shadow-[0_8px_32px_rgba(0,0,0,0.55)] animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black tracking-widest uppercase text-[var(--magenta)]">
          お気に入り新着
        </span>
        <button
          onClick={dismiss}
          className="ml-auto rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          aria-label="閉じる"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex gap-2.5">
        {proxyImg && (
          <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxyImg} alt={payload.title} className="absolute inset-0 h-full w-full object-cover object-right" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[11px] font-bold text-[var(--magenta)] truncate">
            {payload.actressName}の新作が発売！
          </p>
          <p className="text-[10px] text-[var(--text)] line-clamp-2 leading-relaxed">
            {payload.title}
          </p>
        </div>
      </div>

      {/* CTA */}
      {payload.affiliateUrl && (
        <FanzaLink
          href={payload.affiliateUrl}
          targetId={payload.externalId}
          position="fav_alert"
          className="flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--magenta)] to-rose-600 py-1.5 text-[11px] font-bold text-white hover:brightness-110 transition-all"
        >
          FANZAで確認する
        </FanzaLink>
      )}
    </div>
  )
}
