import { TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from './ArticleCard'
import type { Article, Actress } from '@/lib/types'

export async function HeroActressSection() {
  const supabase = await createClient()

  // All active actresses — filter + sort in JS (same pattern as page.tsx)
  const { data: actressRows } = await supabase
    .from('actresses')
    .select('*')
    .eq('is_active', true)

  const heroActresses = ((actressRows ?? []) as Actress[])
    .filter(a => (a.metadata?.hero_rank as number | undefined) != null)
    .sort(
      (a, b) =>
        ((a.metadata!.hero_rank as number) ?? 9999) -
        ((b.metadata!.hero_rank as number) ?? 9999),
    )
    .slice(0, 20)   // top-20 on the hero grid

  if (heroActresses.length === 0) return null

  // Batch-fetch all their latest articles in one query
  const latestCids = heroActresses
    .map(a => a.metadata?.latest_cid as string | undefined)
    .filter((c): c is string => Boolean(c))

  const { data: articleRows } = latestCids.length > 0
    ? await supabase
        .from('articles')
        .select('*')
        .in('external_id', latestCids)
        .eq('is_active', true)
    : { data: [] }

  const articleMap = new Map<string, Article>(
    (articleRows ?? []).map(r => [r.external_id as string, r as Article]),
  )

  const items = heroActresses
    .map(a => ({
      actress: a,
      article: articleMap.get(a.metadata?.latest_cid as string),
      rank:    a.metadata?.hero_rank as number,
    }))
    .filter((item): item is typeof item & { article: Article } => item.article != null)

  if (items.length === 0) return null

  const verityRankThreshold = 50  // ranks > 50 are VERITY-only picks

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <TrendingUp size={17} className="text-[var(--magenta)]" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            旬の女優 最新作
          </h2>
          <span className="rounded-full bg-[var(--magenta)]/15 px-2.5 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
            Top {items.length}
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          FANZA月間ランキング上位 ＋ VERITYオススメ女優の最新リリース
        </p>
      </div>

      {/* pt-3 makes room for the badge that sits above each card */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 pt-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map(({ actress, article, rank }) => {
          const isVerityPick = rank > verityRankThreshold
          return (
            <div key={actress.id} className="relative">
              {isVerityPick ? (
                <span className="absolute -top-2.5 left-3 z-10 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-black shadow-[0_2px_8px_rgba(245,158,11,0.45)]">
                  PICK
                </span>
              ) : (
                <span className="absolute -top-2.5 left-3 z-10 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-500 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-white shadow-[0_2px_8px_rgba(226,0,116,0.4)]">
                  #{rank}
                </span>
              )}
              <div
                className={
                  isVerityPick
                    ? 'rounded-xl ring-2 ring-amber-500/40 ring-offset-1 ring-offset-[var(--bg)] transition-all duration-200 hover:ring-amber-400/70 hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]'
                    : 'rounded-xl ring-1 ring-[var(--magenta)]/25 ring-offset-1 ring-offset-[var(--bg)] transition-all duration-200 hover:ring-[var(--magenta)]/60 hover:shadow-[0_0_20px_rgba(226,0,116,0.18)]'
                }
              >
                <ArticleCard article={article} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
