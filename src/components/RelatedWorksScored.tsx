import Link from 'next/link'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'
import type { Article } from '@/lib/types'

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

function articleImage(article: Article): string | null {
  if (!isBadImageUrl(article.image_url)) return toHighResPackageUrl(article.image_url)
  const metaUrl = (article.metadata as Record<string, unknown> | null)?.url as string | null | undefined
  if (metaUrl?.includes('/dc/doujin/')) {
    const m = metaUrl.match(/\/cid=([^/?]+)/)
    if (m) return `https://pics.dmm.co.jp/digital/comic/${m[1]}/${m[1]}pl.jpg`
  }
  return article.external_id ? cidToCdnUrl(article.external_id, 'pl') : null
}

function articleFanzaUrl(article: Article): string | null {
  const meta = article.metadata as Record<string, unknown> | null
  const raw =
    (typeof meta?.affiliate_url === 'string' ? (meta.affiliate_url as string) : null) ??
    (article.source === 'dmm' && typeof meta?.url === 'string' ? (meta.url as string) : null)
  return withAffiliate(raw)
}

type Entry = { id: number; name: string }

function entryArray(meta: Record<string, unknown> | null | undefined, key: string): Entry[] {
  const raw = meta?.[key]
  if (!Array.isArray(raw)) return []
  return (raw as Array<{ id?: unknown; name?: unknown }>)
    .filter(e => typeof e.id === 'number' && typeof e.name === 'string')
    .map(e => ({ id: e.id as number, name: e.name as string }))
}

const BASE_SELECT =
  'id, title, slug, external_id, image_url, source, metadata, published_at, tags, is_active, category, summary, content, fetched_at'

type Props = { article: Article }

/**
 * スコアベース関連作品セクション「この作品が好きな人はこちら」
 *
 *  - 同一女優      +10
 *  - 同一シリーズ  +8
 *  - 同一メーカー  +5
 *  - 同一ジャンル  +3  (タグ一致 × タグ数。最大上限あり)
 *  - 発売日近い    +1  (30日以内)
 *
 * 上位 6 件を表示。VR作品はジャケット仕様が異なるためデフォルトの非VR
 * 作品では除外する（元作品がVRなら混在許可）。
 */
export async function RelatedWorksScored({ article }: Props) {
  const supabase = await createClient()
  const meta = (article.metadata as Record<string, unknown> | null) ?? {}

  const actresses = entryArray(meta, 'actress')
  const series    = entryArray(meta, 'series')
  const makers    = entryArray(meta, 'maker')
  const actressNameSet = new Set(actresses.map(a => a.name))

  const allTags  = (article.tags ?? []) as string[]
  const genreTags = allTags.filter(t => !actressNameSet.has(t))

  const sourceIsVr = allTags.some(t => t.includes('VR'))
  const publishedAtMs = article.published_at ? new Date(article.published_at).getTime() : null

  // ── 候補プール取得 (各シグナルごとに広めに集めてマージ) ───────────────────
  const candidateMap = new Map<string, Article>()

  const mergeRows = (rows: Article[]) => {
    for (const a of rows) {
      if (!candidateMap.has(a.id)) candidateMap.set(a.id, a)
    }
  }

  const seedGenreTags = genreTags
    .filter(t => !t.includes('VR'))
    .slice(0, 3)

  const fetchByActress = actresses.length > 0
    ? supabase.from('articles').select(BASE_SELECT)
        .overlaps('tags', actresses.map(a => a.name))
        .neq('slug', article.slug)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(60)
        .then(r => r.data ?? [])
    : Promise.resolve([] as unknown[])

  const fetchBySeries = series.length > 0 && series[0].id > 0
    ? supabase.from('articles').select(BASE_SELECT)
        .filter('metadata->series', 'cs', JSON.stringify([{ id: series[0].id }]))
        .neq('slug', article.slug)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(60)
        .then(r => r.data ?? [])
    : Promise.resolve([] as unknown[])

  const fetchByMaker = makers.length > 0 && makers[0].id > 0
    ? supabase.from('articles').select(BASE_SELECT)
        .filter('metadata->maker', 'cs', JSON.stringify([{ id: makers[0].id }]))
        .neq('slug', article.slug)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(60)
        .then(r => r.data ?? [])
    : Promise.resolve([] as unknown[])

  const fetchByGenre = seedGenreTags.length > 0
    ? supabase.from('articles').select(BASE_SELECT)
        .overlaps('tags', seedGenreTags)
        .neq('slug', article.slug)
        .eq('is_active', true)
        .not('metadata->>url', 'like', '%/dc/doujin/%')
        .order('published_at', { ascending: false })
        .limit(60)
        .then(r => r.data ?? [])
    : Promise.resolve([] as unknown[])

  const [actressRows, seriesRows, makerRows, genreRows] = await Promise.all([
    fetchByActress, fetchBySeries, fetchByMaker, fetchByGenre,
  ])
  mergeRows(actressRows as unknown as Article[])
  mergeRows(seriesRows as unknown as Article[])
  mergeRows(makerRows as unknown as Article[])
  mergeRows(genreRows as unknown as Article[])
  if (candidateMap.size === 0) return null

  // ── スコアリング ─────────────────────────────────────────────────────────
  const seriesId = series[0]?.id ?? null
  const makerId  = makers[0]?.id ?? null
  const genreSet = new Set(seedGenreTags)

  const scored = [...candidateMap.values()].map(cand => {
    const candMeta = (cand.metadata as Record<string, unknown> | null) ?? {}
    const candActresses = entryArray(candMeta, 'actress')
    const candSeries    = entryArray(candMeta, 'series')
    const candMakers    = entryArray(candMeta, 'maker')
    const candTags      = (cand.tags ?? []) as string[]
    const candIsVr      = candTags.some(t => t.includes('VR'))

    let score = 0
    const reasons: string[] = []

    // 同一女優: 最重要シグナル
    const sharedActress = actresses.find(a => candActresses.some(c => c.id === a.id))
    if (sharedActress) { score += 10; reasons.push('同女優') }

    // 同一シリーズ
    if (seriesId !== null && candSeries.some(s => s.id === seriesId)) {
      score += 8; reasons.push('同シリーズ')
    }

    // 同一メーカー
    if (makerId !== null && candMakers.some(m => m.id === makerId)) {
      score += 5; reasons.push('同メーカー')
    }

    // 同一ジャンル: 一致タグ数 × 3 (上限 9)
    const sharedGenres = candTags.filter(t => genreSet.has(t))
    if (sharedGenres.length > 0) {
      score += Math.min(sharedGenres.length * 3, 9)
      reasons.push(`同${sharedGenres[0]}`)
    }

    // 発売日近接 (30日以内)
    if (publishedAtMs && cand.published_at) {
      const days = Math.abs(new Date(cand.published_at).getTime() - publishedAtMs) / (24 * 60 * 60 * 1000)
      if (days <= 30) { score += 1 }
    }

    return { article: cand, score, reasons, candIsVr }
  })

  // VR フィルタ: 元作品が非VRなら候補もVR除外
  const filtered = sourceIsVr ? scored : scored.filter(s => !s.candIsVr)
  const top = filtered
    .filter(s => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // 同点は新しい順
      return (b.article.published_at ?? '').localeCompare(a.article.published_at ?? '')
    })
    .slice(0, 6)

  if (top.length === 0) return null

  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-8">
      <div className="flex items-center gap-2.5">
        <Heart size={15} className="text-[var(--magenta)] fill-[var(--magenta)]/30" />
        <h2 className="text-base font-bold tracking-tight text-[var(--text)]">
          この作品が好きな人はこちら
        </h2>
        <span className="rounded-full bg-[var(--magenta)]/12 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase text-[var(--magenta)]">
          Related Works
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {top.map(({ article: cand, reasons }) => {
          const img = articleImage(cand)
          const fanza = articleFanzaUrl(cand)
          const imgEl = img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyUrl(img)}
              alt={cand.title}
              className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(cand.image_url)} transition-transform duration-300 group-hover/img:scale-[1.05]`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--text-muted)]">
              NO IMAGE
            </div>
          )
          const ImageWrapper = fanza
            ? (
              <FanzaLink
                href={fanza}
                targetId={cand.external_id}
                position="related_scored_image"
                className="group/img relative block aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]"
              >
                {imgEl}
                {reasons.length > 0 && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-black/55 backdrop-blur-sm px-1.5 py-0.5 text-[8px] font-bold text-white ring-1 ring-white/15">
                    {reasons[0]}
                  </span>
                )}
                <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover/img:bg-black/60 md:flex">
                  <span className="translate-y-1 scale-95 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-gray-900 opacity-0 shadow transition-all duration-200 group-hover/img:translate-y-0 group-hover/img:scale-100 group-hover/img:opacity-100">
                    ▶ FANZAで観る
                  </span>
                </div>
              </FanzaLink>
            )
            : (
              <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]">
                {imgEl}
                {reasons.length > 0 && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-black/55 backdrop-blur-sm px-1.5 py-0.5 text-[8px] font-bold text-white ring-1 ring-white/15">
                    {reasons[0]}
                  </span>
                )}
              </div>
            )

          return (
            <div key={cand.id} className="flex flex-col gap-1.5">
              {ImageWrapper}
              <Link
                href={`/verity/articles/${cand.slug}`}
                className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text)] transition-colors hover:text-[var(--magenta)]"
              >
                {cand.title}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
