'use client'

import { useState } from 'react'
import { SocialFeedCell } from './SocialFeedCell'
import {
  fetchMoreSocialPosts,
  type SocialPostWithFanza,
} from '@/app/verity/actions/socialFeed'

const LOAD_MORE_COUNT = 20
const SKELETON_COUNT  = 12   // 4 mobile rows / ~2 desktop rows shown during load

function SkeletonCell() {
  return (
    <div className="aspect-square overflow-hidden bg-[var(--surface-2)]">
      <div className="h-full w-full animate-pulse bg-gradient-to-br from-[var(--surface-2)] to-[var(--border)]/40" />
    </div>
  )
}

type Props = {
  initialPosts:   SocialPostWithFanza[]
  initialHasMore: boolean
}

export function SocialFeedGrid({ initialPosts, initialHasMore }: Props) {
  const [posts,   setPosts]   = useState(initialPosts)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const { posts: next, hasMore: more } = await fetchMoreSocialPosts(
        posts.length,
        LOAD_MORE_COUNT,
      )
      setPosts(prev => [...prev, ...next])
      setHasMore(more)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Photo grid ── */}
      <div className="grid grid-cols-3 gap-1 md:grid-cols-5">
        {posts.map(post => (
          <SocialFeedCell
            key={post.id}
            imageUrl={post.image_url}
            actressName={post.actress_name}
            screenName={post.screen_name}
            postUrl={post.post_url}
            fanzaHref={post.fanzaHref}
          />
        ))}

        {/* Skeleton cells appended during load */}
        {loading && Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <SkeletonCell key={`sk-${i}`} />
        ))}
      </div>

      {/* ── Load-more / exhausted indicator ── */}
      {hasMore ? (
        <div className="flex justify-center pt-1">
          <button
            onClick={loadMore}
            disabled={loading}
            className={[
              'group relative flex items-center gap-2.5 rounded-full',
              'border border-[var(--border)] px-7 py-2.5',
              'text-sm font-semibold text-[var(--text-muted)]',
              'transition-all duration-200',
              loading
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-[var(--magenta)]/60 hover:text-[var(--magenta)]',
              'hover:shadow-[0_0_20px_rgba(226,0,116,0.18)]',
            ].join(' ')}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--magenta)]" />
                読み込み中…
              </>
            ) : (
              <>
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)]/60 transition-all
                             group-hover:bg-[var(--magenta)] group-hover:shadow-[0_0_6px_rgba(226,0,116,0.7)]"
                />
                もっと見る
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)]/60 transition-all
                             group-hover:bg-[var(--magenta)] group-hover:shadow-[0_0_6px_rgba(226,0,116,0.7)]"
                />
              </>
            )}
          </button>
        </div>
      ) : posts.length > 0 ? (
        <p className="text-center text-xs text-[var(--text-muted)]/60 pt-1">
          すべての投稿を表示しました
        </p>
      ) : null}
    </div>
  )
}
