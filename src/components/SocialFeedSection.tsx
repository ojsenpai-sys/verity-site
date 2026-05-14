import { createClient } from '@/lib/supabase/server'
import { SocialFeedGrid } from './SocialFeedGrid'
import { buildFanzaUrl } from '@/lib/fanzaUtils'
import type { SocialPostWithFanza } from '@/app/verity/actions/socialFeed'

const INITIAL_LIMIT = 20

type SocialPost = {
  id:           string
  actress_name: string
  screen_name:  string
  post_id:      string
  image_url:    string
  post_url:     string
  created_at:   string
}

function XLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export async function SocialFeedSection() {
  const supabase = await createClient()

  // Fetch INITIAL_LIMIT + 1 to detect whether more posts exist
  const { data, error } = await supabase
    .from('social_feeds')
    .select('id, actress_name, screen_name, post_id, image_url, post_url, created_at')
    .order('created_at', { ascending: false })
    .range(0, INITIAL_LIMIT)   // 0..INITIAL_LIMIT = INITIAL_LIMIT+1 rows max

  if (error) console.error('[SocialFeedSection] query error:', error.message)

  const raw      = (data as SocialPost[]) ?? []
  const hasMore  = raw.length > INITIAL_LIMIT
  const slice    = raw.slice(0, INITIAL_LIMIT)

  if (slice.length === 0) return null

  // Pre-compute FANZA hrefs server-side
  const uniqueNames = [...new Set(slice.map(p => p.actress_name))]
  const { data: actressRows } = await supabase
    .from('actresses')
    .select('name, external_id')
    .in('name', uniqueNames)

  const actressIdMap = new Map<string, number>()
  for (const row of actressRows ?? []) {
    const match = String(row.external_id ?? '').match(/dmm-actress-(\d+)/)
    if (match) actressIdMap.set(row.name as string, parseInt(match[1], 10))
  }

  const initialPosts: SocialPostWithFanza[] = slice.map(p => ({
    ...p,
    fanzaHref: buildFanzaUrl(p.actress_name, actressIdMap.get(p.actress_name) ?? null),
  }))

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <XLogo size={16} />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            SOCIAL FEEDS
          </h2>
          <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
            X
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          旬の女優たちの最新ポストをリアルタイムでチェック
        </p>
      </div>

      <div className="h-px bg-gradient-to-r from-[var(--magenta)]/30 via-[var(--border)] to-transparent" />

      <SocialFeedGrid initialPosts={initialPosts} initialHasMore={hasMore} />
    </section>
  )
}
