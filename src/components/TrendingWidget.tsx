import Link from 'next/link'
import { Flame, Sparkles, ChevronRight, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import {
  toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass,
} from '@/lib/cidUtils'
import {
  getAllArticleScores, getAllActressScores,
} from '@/lib/articleScoring'
import type { Article, Actress } from '@/lib/types'

/**
 * トップページ「今話題」コンパクトウィジェット (3カラム)
 *  - 今話題の作品 6件 — 直近7日 user_events スコア上位
 *  - 今話題の女優 6件 — 同上 (actress events)
 *  - 急上昇ジャンル 6件 — 直近30日のタグ出現を前30日と比較
 *
 * /verity/rankings (Phase 4-4) への流入導線を兼ねる。
 */

function proxyJacket(article: Pick<Article, 'image_url' | 'external_id'>): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  if (article.external_id) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
  return null
}

function proxyActressImg(actress: Pick<Actress, 'image_url' | 'metadata'>): string | null {
  const raw = isBadImageUrl(actress.image_url) ? null : actress.image_url
  if (raw) return `/verity/api/proxy/image?url=${encodeURIComponent(toHighResPackageUrl(raw) ?? raw)}`
  const cid = (actress.metadata as Record<string, unknown> | null)?.latest_cid as string | undefined
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

async function loadTrendingGenres(): Promise<Array<{ name: string; ratio: number; recent: number }>> {
  const supabase = await createClient()
  const now = Date.now()
  const d30 = new Date(now - 30 * 24 * 3_600_000).toISOString()
  const d60 = new Date(now - 60 * 24 * 3_600_000).toISOString()

  const [{ data: actressRows }, { data: rec }, { data: pri }] = await Promise.all([
    supabase.from('actresses').select('name').eq('is_active', true),
    supabase.from('articles')
      .select('tags')
      .eq('is_active', true)
      .gte('published_at', d30)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .limit(1500),
    supabase.from('articles')
      .select('tags')
      .eq('is_active', true)
      .gte('published_at', d60)
      .lt('published_at', d30)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .limit(1500),
  ])
  const nameSet = new Set(((actressRows ?? []) as { name: string }[]).map(r => r.name))
  function count(rows: { tags: string[] | null }[] | null): Map<string, number> {
    const c = new Map<string, number>()
    for (const r of rows ?? []) for (const t of r.tags ?? []) {
      if (!t || nameSet.has(t)) continue
      if (t === 'VR' || (t.includes('VR') && t.length < 8)) continue
      c.set(t, (c.get(t) ?? 0) + 1)
    }
    return c
  }
  const rMap = count(rec as { tags: string[] | null }[] | null)
  const pMap = count(pri as { tags: string[] | null }[] | null)
  const out: Array<{ name: string; ratio: number; recent: number }> = []
  for (const [name, r] of rMap.entries()) {
    if (r < 3) continue
    const p = pMap.get(name) ?? 0
    const ratio = p === 0 ? r * 2 : r / p
    if (ratio > 1.2) out.push({ name, ratio, recent: r })
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 6)
}

export async function TrendingWidget() {
  const supabase = await createClient()

  const [articleScores, actressScores, trendingGenres] = await Promise.all([
    getAllArticleScores('7d'),
    getAllActressScores('7d'),
    loadTrendingGenres(),
  ])

  const topArticleIds = [...articleScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k)
  const topActressIds = [...actressScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k)

  const [articleRows, actressRows] = await Promise.all([
    topArticleIds.length > 0
      ? supabase.from('articles').select('*').in('external_id', topArticleIds).eq('is_active', true)
      : Promise.resolve({ data: [] as Article[] }),
    topActressIds.length > 0
      ? supabase.from('actresses').select('*').in('external_id', topActressIds).eq('is_active', true)
      : Promise.resolve({ data: [] as Actress[] }),
  ])
  const articleMap = new Map(((articleRows.data ?? []) as Article[]).map(a => [a.external_id, a]))
  const actressMap = new Map(((actressRows.data ?? []) as Actress[]).map(a => [a.external_id, a]))
  const topArticles = topArticleIds.map(id => articleMap.get(id)).filter((a): a is Article => !!a)
  const topActresses = topActressIds.map(id => actressMap.get(id)).filter((a): a is Actress => !!a)

  if (topArticles.length === 0 && topActresses.length === 0 && trendingGenres.length === 0) {
    return null
  }

  return (
    <section
      id="trending-widget"
      className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-[var(--surface)] p-5 space-y-5
                 shadow-[0_0_36px_rgba(16,185,129,0.10)]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent)' }}
      />

      <div className="flex items-center gap-2.5">
        <Flame size={15} className="text-emerald-400" />
        <h2 className="text-base font-bold tracking-tight text-[var(--text)]">今話題</h2>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase text-emerald-300">
          Trending Now
        </span>
        <Link
          href="/verity/rankings"
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          ライブランキングを見る <ChevronRight size={11} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* 今話題の作品 */}
        {topArticles.length > 0 && (
          <div className="space-y-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-amber-400">
              <Sparkles size={10} />
              話題の作品
            </p>
            <div className="grid grid-cols-3 gap-2">
              {topArticles.map((a, i) => {
                const img = proxyJacket(a)
                return (
                  <Link
                    key={a.id}
                    href={`/verity/articles/${a.slug}`}
                    className="group block"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-[var(--surface-2)] ring-1 ring-[var(--border)] transition-all group-hover:ring-amber-400/60 group-hover:shadow-[0_0_14px_rgba(245,158,11,0.25)]">
                      {img ? (
                        <ProxiedImage
                          src={img}
                          alt={a.title}
                          className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(a.image_url)} transition-transform group-hover:scale-105`}
                        />
                      ) : <div className="absolute inset-0 bg-[var(--surface-2)]" />}
                      <span className="absolute left-1 top-1 inline-flex items-center justify-center rounded bg-amber-500/95 px-1 py-0 text-[9px] font-black tabular-nums text-white shadow">
                        #{i + 1}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[var(--text)] group-hover:text-amber-300 transition-colors">
                      {a.title}
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* 今話題の女優 */}
        {topActresses.length > 0 && (
          <div className="space-y-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-[var(--magenta)]">
              <Sparkles size={10} />
              話題の女優
            </p>
            <div className="grid grid-cols-3 gap-2">
              {topActresses.map((act, i) => {
                const img = proxyActressImg(act)
                return (
                  <Link
                    key={act.id}
                    href={`/verity/actresses/${act.external_id}`}
                    className="group flex flex-col items-center gap-1 text-center"
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-full ring-1 ring-[var(--border)] bg-[var(--surface-2)] transition-all group-hover:ring-2 group-hover:ring-[var(--magenta)]/60 group-hover:shadow-[0_0_14px_rgba(226,0,116,0.3)]">
                      {img ? (
                        <ProxiedImage
                          src={img}
                          alt={act.name}
                          className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(act.image_url)} transition-transform group-hover:scale-110`}
                        />
                      ) : <div className="absolute inset-0 bg-[var(--surface-2)]" />}
                      <span className="absolute left-0.5 top-0.5 inline-flex items-center justify-center rounded bg-[var(--magenta)]/95 px-1 py-0 text-[9px] font-black tabular-nums text-white shadow">
                        #{i + 1}
                      </span>
                    </div>
                    <span className="line-clamp-1 text-[10px] font-semibold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors">
                      {act.name}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* 急上昇ジャンル */}
        {trendingGenres.length > 0 && (
          <div className="space-y-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-emerald-400">
              <Flame size={10} />
              急上昇ジャンル
            </p>
            <div className="flex flex-wrap gap-1.5">
              {trendingGenres.map(({ name, recent }) => (
                <Link
                  key={name}
                  href={`/verity/genres/${encodeURIComponent(name)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 transition-all hover:border-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                >
                  <Tag size={9} />
                  <span className="font-semibold">{name}</span>
                  <span className="tabular-nums text-[9px] opacity-70">{recent}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
