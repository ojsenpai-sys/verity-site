import { Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fetchDmmItems, normalizeDmmItem } from '@/lib/sources/dmm'
import { FEATURED_CIDS } from '@/lib/featuredCids'
import { ArticleCard } from './ArticleCard'
import type { Article } from '@/lib/types'

// "snos208" → "SNOS-208"  /  "1fns197" → "1FNS-197"
function cidToProductNumber(cid: string): string {
  const m = cid.match(/^(.*?)(\d+)$/)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : cid.toUpperCase()
}

// Fetch one specific CID from both digital and mono endpoints in parallel.
// Returns the richer result (prefers sample_movie_url), or null if not found.
async function fetchCidLive(cid: string): Promise<Article | null> {
  const hasDmmKey = !!(process.env.DMM_API_ID && process.env.AFFILIATE_ID)
  if (!hasDmmKey) return null

  // raw content_id like "snos208" → product number "SNOS-208" for reliable DMM search
  const keyword = cidToProductNumber(cid)

  const [dRes, mRes] = await Promise.allSettled([
    fetchDmmItems({ keyword, hits: 10, service: 'digital', floor: 'videoa' }),
    fetchDmmItems({ keyword, hits: 10, service: 'mono',    floor: 'dvd'    }),
  ])

  const dItems = dRes.status === 'fulfilled'
    ? dRes.value.filter(i => i.content_id === cid)
    : []
  const mItems = mRes.status === 'fulfilled'
    ? mRes.value.filter(i => i.content_id === cid)
    : []

  // Prefer the version that has a sample movie URL; fall back to digital then mono
  const best =
    dItems.find(i => i.sampleMovieURL) ??
    mItems.find(i => i.sampleMovieURL) ??
    dItems[0] ?? mItems[0] ?? null

  if (!best) return null

  const floor = mItems.includes(best) ? 'dvd' : 'videoa'
  return normalizeDmmItem(best, floor) as unknown as Article
}

export async function FeaturedSection() {
  const supabase = await createClient()

  // Step 1: DB lookup — fast path for synced articles
  const { data: dbRows } = await supabase
    .from('articles')
    .select('*')
    .in('external_id', [...FEATURED_CIDS])
    .eq('is_active', true)

  const articleMap = new Map<string, Article>(
    (dbRows ?? []).map(r => [r.external_id as string, r as Article])
  )

  // Step 2: Live fallback for any CIDs missing from DB
  const missingCids = [...FEATURED_CIDS].filter(cid => !articleMap.has(cid))
  if (missingCids.length > 0) {
    await Promise.allSettled(
      missingCids.map(async cid => {
        const article = await fetchCidLive(cid)
        if (article) articleMap.set(cid, article)
      })
    )
  }

  // Maintain FEATURED_CIDS order
  const articles = [...FEATURED_CIDS]
    .map(cid => articleMap.get(cid))
    .filter((a): a is Article => Boolean(a))

  if (articles.length === 0) return null

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Star size={17} className="fill-amber-400 text-amber-400" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            VERITYオススメ女優
          </h2>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
            厳選 {articles.length}作
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          VERITYが自信をもってオススメしたい女優の最新作をピックアップして紹介！
        </p>
      </div>

      {/* Grid — pt-3 makes room for the PICK badge that floats above each card */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 pt-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {articles.map(article => (
          <div key={article.external_id ?? article.id} className="relative">
            {/* PICK badge — sits above the card's top edge */}
            <span className="absolute -top-2.5 left-3 z-10 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-black shadow-[0_2px_8px_rgba(245,158,11,0.45)]">
              VERITY PICK
            </span>
            {/* Gold ring wrapper */}
            <div className="rounded-xl ring-2 ring-amber-500/40 ring-offset-1 ring-offset-[var(--bg)] transition-all duration-200 hover:ring-amber-400/70 hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]">
              <ArticleCard article={article} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
