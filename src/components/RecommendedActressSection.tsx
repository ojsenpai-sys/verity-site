import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RECOMMENDED_ACTRESS_NAMES } from '@/lib/recommendedActresses'
import { ArticleCard } from './ArticleCard'
import type { Article } from '@/lib/types'

export async function RecommendedActressSection() {
  const supabase = await createClient()
  const names = [...RECOMMENDED_ACTRESS_NAMES]
  const nameSet = new Set<string>(names)

  // One overlapping query — GIN index on tags makes this fast.
  // Articles are ordered newest-first so the first hit per actress IS the latest.
  const { data: rows } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .overlaps('tags', names)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(500)

  // Pick the most-recent article for each actress in list order
  const articleByActress = new Map<string, Article>()
  for (const art of rows ?? []) {
    for (const tag of (art.tags ?? []) as string[]) {
      if (nameSet.has(tag) && !articleByActress.has(tag)) {
        articleByActress.set(tag, art as Article)
      }
    }
    if (articleByActress.size === nameSet.size) break
  }

  // Preserve RECOMMENDED_ACTRESS_NAMES display order
  const items = names
    .map((name): { actressName: string; article: Article } | null => {
      const article = articleByActress.get(name)
      return article ? { actressName: name, article } : null
    })
    .filter((x): x is { actressName: string; article: Article } => x !== null)

  if (items.length === 0) return null

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Sparkles size={17} className="text-violet-400" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            旬の女優 最新作
          </h2>
          <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-bold text-violet-400">
            {items.length}名
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          FANZAイチオシ女優の最新リリース
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map(({ actressName, article }) => (
          <ArticleCard key={actressName} article={article} />
        ))}
      </div>
    </section>
  )
}
