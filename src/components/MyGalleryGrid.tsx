'use client'

import { useState, useEffect, useRef } from 'react'
import { SocialFeedCell } from './SocialFeedCell'
import {
  fetchMyGalleryPosts,
  markGalleryAsRead,
  notifyAdminMissingSns,
  type GalleryPost,
} from '@/app/verity/actions/gallery'
import type { Actress } from '@/lib/types'

type Props = {
  lastCheckedAt:       string | null
  favoriteActresses:   Actress[]
  missingSnsActresses: Actress[]   // favorites with no social_feeds posts
}

function SkeletonCell() {
  return (
    <div className="aspect-square bg-[var(--surface-2)] overflow-hidden">
      <div className="h-full w-full animate-pulse bg-gradient-to-br from-[var(--surface-2)] to-[var(--border)]/40" />
    </div>
  )
}

function GalleryCell({ post }: { post: GalleryPost }) {
  return (
    <div className="relative">
      {post.isNew && (
        <div className="absolute left-1.5 top-1.5 z-40 pointer-events-none
                        rounded-full bg-[var(--magenta)] px-1.5 py-0.5
                        text-[8px] font-black uppercase tracking-wider text-white
                        shadow-[0_0_8px_rgba(226,0,116,0.6)]">
          NEW
        </div>
      )}
      <SocialFeedCell
        imageUrl={post.image_url}
        actressName={post.actress_name}
        screenName={post.screen_name}
        postUrl={post.post_url}
        fanzaHref={post.fanzaHref}
      />
    </div>
  )
}

export function MyGalleryGrid({ lastCheckedAt, favoriteActresses, missingSnsActresses }: Props) {
  const [posts,       setPosts]       = useState<GalleryPost[]>([])
  const [hasMore,     setHasMore]     = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const notifiedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { posts: initial, hasMore: more } = await fetchMyGalleryPosts(lastCheckedAt, 0)
      if (cancelled) return
      setPosts(initial)
      setHasMore(more)
      setLoading(false)

      // Mark as read (fire & forget)
      markGalleryAsRead()

      // Notify admin about missing SNS actresses (one email per actress per 24h globally)
      for (const a of missingSnsActresses) {
        if (!notifiedRef.current.has(a.id)) {
          notifiedRef.current.add(a.id)
          notifyAdminMissingSns(a.external_id, a.name)
        }
      }
    }

    init()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const { posts: next, hasMore: more } = await fetchMyGalleryPosts(lastCheckedAt, posts.length)
      setPosts(prev => [...prev, ...next])
      setHasMore(more)
    } finally {
      setLoadingMore(false)
    }
  }

  // ── Initial loading skeleton ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {missingSnsActresses.length > 0 && <MissingSnsBanner actresses={missingSnsActresses} />}
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }).map((_, i) => <SkeletonCell key={i} />)}
        </div>
      </div>
    )
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (posts.length === 0) {
    return (
      <div className="space-y-4">
        {missingSnsActresses.length > 0 && <MissingSnsBanner actresses={missingSnsActresses} />}
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="text-4xl">📷</span>
          <p className="text-sm font-medium text-[var(--text-muted)]">
            {favoriteActresses.length === 0
              ? 'お気に入り女優を登録するとギャラリーが表示されます'
              : 'お気に入り女優のSNS投稿がまだありません'}
          </p>
          {missingSnsActresses.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]/60">
              現在編集部が捜索・同期中です。しばらくお待ちください。
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Main grid ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {missingSnsActresses.length > 0 && <MissingSnsBanner actresses={missingSnsActresses} />}

      <div className="grid grid-cols-3 gap-1">
        {posts.map(post => <GalleryCell key={post.id} post={post} />)}
        {loadingMore && Array.from({ length: 6 }).map((_, i) => <SkeletonCell key={`sk-${i}`} />)}
      </div>

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className={[
              'group flex items-center gap-2.5 rounded-full',
              'border border-[var(--border)] px-7 py-2.5',
              'text-sm font-semibold text-[var(--text-muted)] transition-all duration-200',
              loadingMore
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-[var(--magenta)]/60 hover:text-[var(--magenta)]',
              'hover:shadow-[0_0_20px_rgba(226,0,116,0.18)]',
            ].join(' ')}
          >
            {loadingMore ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--magenta)]" />
                読み込み中…
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)]/60
                                 group-hover:bg-[var(--magenta)] transition-all" />
                もっと見る
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)]/60
                                 group-hover:bg-[var(--magenta)] transition-all" />
              </>
            )}
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-[var(--text-muted)]/60 pt-1">
          すべての投稿を表示しました
        </p>
      )}
    </div>
  )
}

// ── Missing SNS banner ─────────────────────────────────────────────────────────
function MissingSnsBanner({ actresses }: { actresses: Actress[] }) {
  return (
    <div className="flex items-start gap-3 rounded-xl
                    border border-amber-400/30 bg-amber-400/8 px-4 py-3">
      <span className="text-lg shrink-0 mt-0.5">🔍</span>
      <div className="space-y-0.5">
        <p className="text-xs font-semibold text-amber-300">捜索中の女優がいます</p>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          <span className="font-medium text-[var(--text)]">
            {actresses.map(a => a.name).join('・')}
          </span>{' '}
          のSNSアカウントを現在編集部が捜索・同期中です。見つかり次第ギャラリーに追加されます。
        </p>
      </div>
    </div>
  )
}
