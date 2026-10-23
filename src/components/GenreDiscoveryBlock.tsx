import Link from 'next/link'
import { Tag, Flame, TrendingUp } from 'lucide-react'
import { unstable_cache } from 'next/cache'
import { getStatelessSupabaseClient } from '@/lib/supabase/statelessClient'
import { handleSupabaseFetchError } from '@/lib/supabase/timeoutHandler'
import { singleFlight } from '@/lib/singleFlight.mjs'

type Props = {
  /** 現在の作品ジャンルタグ。これらは強調表示する。 */
  currentTags?: string[]
  /** 表示しない女優名集合（タグから除外） */
  excludeNames?: Set<string>
}

type GenreAggregates = {
  popular: Array<{ name: string; count: number }>
  trending: Array<{ name: string; ratio: number; recent: number }>
}

// Phase 1A: 作品ページごとに同一の全体集計(4クエリ)を毎回実行していたため共有キャッシュする。
// 集計は引数・ユーザー情報に依存しない(currentTags による強調は表示側で行う)。
// タグ分布は日次の同期でしか動かないため15分で十分。
const GENRE_AGGREGATES_REVALIDATE_SECONDS = 900

/**
 * DB全体のタグ出現を集計し、人気ジャンルと急上昇ジャンルを返す。
 * クエリが1つでも失敗した場合は throw する(空/部分的な集計結果を15分間キャッシュしないため)。
 */
async function loadGenresRaw(): Promise<GenreAggregates> {
  const supabase = getStatelessSupabaseClient()
  const now      = new Date()
  const d30      = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const d60      = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const results = await Promise.all([
      supabase.from('actresses').select('name').eq('is_active', true),
      supabase.from('articles')
        .select('tags')
        .eq('is_active', true)
        .not('tags', 'is', null)
        .not('metadata->>url', 'like', '%/dc/doujin/%')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(3000),
      supabase.from('articles')
        .select('tags')
        .eq('is_active', true)
        .not('tags', 'is', null)
        .gte('published_at', d30)
        .not('metadata->>url', 'like', '%/dc/doujin/%')
        .limit(2000),
      supabase.from('articles')
        .select('tags')
        .eq('is_active', true)
        .not('tags', 'is', null)
        .gte('published_at', d60)
        .lt('published_at', d30)
        .not('metadata->>url', 'like', '%/dc/doujin/%')
        .limit(2000),
    ])
  const failed = results.find(r => r.error)
  if (failed?.error) throw new Error(`GenreDiscoveryBlock aggregate query failed: ${failed.error.message}`)
  const [{ data: actressRows }, { data: allTagRows }, { data: recentTagRows }, { data: priorTagRows }] = results

  const actressNameSet = new Set(
    ((actressRows ?? []) as { name: string }[]).map(r => r.name)
  )

  function countTags(rows: { tags: string[] | null }[] | null): Map<string, number> {
    const c = new Map<string, number>()
    for (const r of rows ?? []) {
      for (const t of r.tags ?? []) {
        if (!t) continue
        if (actressNameSet.has(t)) continue
        if (t.includes('VR') && t.length < 8) continue // タグとして「VR」だけは除外
        c.set(t, (c.get(t) ?? 0) + 1)
      }
    }
    return c
  }

  const allCount    = countTags(allTagRows as { tags: string[] | null }[] | null)
  const recentCount = countTags(recentTagRows as { tags: string[] | null }[] | null)
  const priorCount  = countTags(priorTagRows as { tags: string[] | null }[] | null)

  const popular = [...allCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }))

  // 急上昇: 直近30日 / 前30日 のレシオで上位。最低出現数フィルタで安定化。
  const trendingRaw: Array<{ name: string; ratio: number; recent: number }> = []
  for (const [name, recent] of recentCount.entries()) {
    if (recent < 3) continue
    const prior = priorCount.get(name) ?? 0
    const ratio = prior === 0 ? recent * 2 : recent / prior   // 0除算は新規扱いで強めに
    if (ratio > 1.2) trendingRaw.push({ name, ratio, recent })
  }
  const trending = trendingRaw
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 8)

  return { popular, trending }
}

const getCachedGenreAggregates = unstable_cache(
  () => singleFlight('genre-discovery-aggregates', loadGenresRaw),
  ['genre-discovery-aggregates'],
  { revalidate: GENRE_AGGREGATES_REVALIDATE_SECONDS },
)

/** 失敗時は空集計(=ブロック非表示)へ縮退する。失敗結果はキャッシュされない。 */
async function loadGenres(): Promise<GenreAggregates> {
  try {
    return await getCachedGenreAggregates()
  } catch (err) {
    handleSupabaseFetchError('GenreDiscoveryBlock.loadGenres', err)
    return { popular: [], trending: [] }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export async function GenreDiscoveryBlock({ currentTags = [], excludeNames }: Props) {
  const currentSet = new Set(currentTags.filter(t => !excludeNames?.has(t)))
  const { popular, trending } = await loadGenres()

  if (!popular.length && !trending.length) return null

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center gap-2.5">
        <Tag size={14} className="text-[var(--magenta)]" />
        <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">
          ジャンルから他の作品を探す
        </h2>
        <span className="rounded-full bg-[var(--magenta)]/12 px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase text-[var(--magenta)]">
          Genre Discovery
        </span>
      </div>

      {trending.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-emerald-400">
            <Flame size={10} />
            急上昇ジャンル
            <span className="ml-1 text-[9px] font-normal text-[var(--text-muted)] normal-case tracking-normal">
              直近30日に伸びたタグ
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {trending.map(({ name, recent }) => {
              const here = currentSet.has(name)
              return (
                <Link
                  key={name}
                  href={`/verity/genres/${encodeURIComponent(name)}`}
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all',
                    here
                      ? 'border border-[var(--magenta)]/60 bg-[var(--magenta)]/15 text-[var(--magenta)] shadow-[0_0_8px_rgba(226,0,116,0.25)]'
                      : 'border border-emerald-500/40 bg-emerald-500/8 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/15 hover:shadow-[0_0_10px_rgba(16,185,129,0.3)]',
                  ].join(' ')}
                >
                  <Flame size={9} />
                  <span className="font-semibold">{name}</span>
                  <span className="tabular-nums text-[9px] opacity-70">{recent}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {popular.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-amber-400">
            <TrendingUp size={10} />
            人気ジャンルTOP
            <span className="ml-1 text-[9px] font-normal text-[var(--text-muted)] normal-case tracking-normal">
              VERITY収録作品で多いタグ
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {popular.map(({ name, count }) => {
              const here = currentSet.has(name)
              return (
                <Link
                  key={name}
                  href={`/verity/genres/${encodeURIComponent(name)}`}
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-all',
                    here
                      ? 'border border-[var(--magenta)]/60 bg-[var(--magenta)]/15 text-[var(--magenta)] shadow-[0_0_8px_rgba(226,0,116,0.25)]'
                      : 'border border-amber-500/30 bg-amber-500/8 text-amber-300/85 hover:border-amber-400 hover:bg-amber-500/15',
                  ].join(' ')}
                >
                  <Tag size={9} />
                  <span className="font-semibold">{name}</span>
                  <span className="tabular-nums text-[9px] opacity-70">{count}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
