import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'
import type { Article } from '@/lib/types'

function proxyUrl(url: string) {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

function getArticleImageUrl(article: Article): string | null {
  if (!isBadImageUrl(article.image_url)) return toHighResPackageUrl(article.image_url)
  const metaUrl = article.metadata?.url as string | null | undefined
  if (metaUrl?.includes('/dc/doujin/')) {
    const m = metaUrl.match(/\/cid=([^/?]+)/)
    if (m) return `https://pics.dmm.co.jp/digital/comic/${m[1]}/${m[1]}pl.jpg`
  }
  return article.external_id ? cidToCdnUrl(article.external_id, 'pl') : null
}

function getArticleFanzaUrl(article: Article): string | null {
  const raw =
    (typeof article.metadata?.affiliate_url === 'string' ? article.metadata.affiliate_url : null) ??
    (article.source === 'dmm' && typeof article.metadata?.url === 'string'
      ? (article.metadata.url as string)
      : null)
  return withAffiliate(raw)
}

function RelatedMiniCard({ article }: { article: Article }) {
  const imgUrl = getArticleImageUrl(article)
  const fanzaUrl = getArticleFanzaUrl(article)

  const imgEl = imgUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxyUrl(imgUrl)}
      alt={article.title}
      className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(article.image_url)} transition-transform duration-300 group-hover/img:scale-[1.05]`}
    />
  ) : (
    <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--text-muted)]">
      NO IMAGE
    </div>
  )

  return (
    <div className="flex w-36 flex-shrink-0 flex-col gap-1.5">
      {fanzaUrl ? (
        <FanzaLink
          href={fanzaUrl}
          targetId={article.external_id}
          position="related_image"
          className="group/img relative block aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]"
        >
          {imgEl}
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover/img:bg-black/60 md:flex">
            <span className="translate-y-1 scale-95 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-gray-900 opacity-0 shadow transition-all duration-200 group-hover/img:translate-y-0 group-hover/img:scale-100 group-hover/img:opacity-100">
              ▶ FANZAで観る
            </span>
          </div>
        </FanzaLink>
      ) : (
        <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]">
          {imgEl}
        </div>
      )}
      <Link
        href={`/verity/articles/${article.slug}`}
        className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text)] transition-colors hover:text-[var(--magenta)]"
      >
        {article.title}
      </Link>
    </div>
  )
}

type DmmEntry = { id: number; name: string }

const BASE_SELECT =
  'id, title, slug, external_id, image_url, source, metadata, published_at, tags, is_active, category, summary, content, fetched_at'

type Props = { article: Article }

export async function RelatedArticlesSection({ article }: Props) {
  const supabase = await createClient()

  const actresses = Array.isArray(article.metadata?.actress)
    ? (article.metadata!.actress as DmmEntry[])
    : []
  const actressNameSet = new Set(actresses.map((a) => a.name))
  const genreTags = (article.tags ?? []).filter((t) => !actressNameSet.has(t))
  const series = Array.isArray(article.metadata?.series)
    ? (article.metadata!.series as DmmEntry[])
    : []

  const fetchByActress = async (): Promise<Article[]> => {
    if (!actresses.length) return []
    const { data } = await supabase
      .from('articles')
      .select(BASE_SELECT)
      .contains('tags', [actresses[0].name])
      .neq('slug', article.slug)
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(4)
    return (data ?? []) as unknown as Article[]
  }

  const fetchByGenre = async (): Promise<Article[]> => {
    if (!genreTags.length) return []
    // VRタグ（「VR」含む）をクエリから除外：VR作品はジャケット仕様が異なりUIが壊れるため
    const nonVrGenreTags = genreTags.filter((t) => !t.includes('VR'))
    if (!nonVrGenreTags.length) return []
    const { data } = await supabase
      .from('articles')
      .select(BASE_SELECT)
      .overlaps('tags', nonVrGenreTags)
      .neq('slug', article.slug)
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(16) // post-filterで4件確保できるよう多めに取得
    // post-fetch: 非VRタグで取得したが共通タグ経由でVRが混入する場合も除外
    return ((data ?? []) as unknown as Article[]).filter(
      (a) => !(a.tags ?? []).some((t) => t.includes('VR'))
    )
  }

  const fetchBySeries = async (): Promise<Article[]> => {
    if (!series.length || series[0].id <= 0) return []
    const { data } = await supabase
      .from('articles')
      .select(BASE_SELECT)
      .filter('metadata->series', 'cs', JSON.stringify([{ id: series[0].id }]))
      .neq('slug', article.slug)
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(4)
    return (data ?? []) as unknown as Article[]
  }

  const [byActress, byGenreRaw, bySeries] = await Promise.all([
    fetchByActress(),
    fetchByGenre(),
    fetchBySeries(),
  ])

  // genre: dedup actress results for variety
  const actressIdSet = new Set(byActress.map((a) => a.id))
  const byGenre = byGenreRaw.filter((a) => !actressIdSet.has(a.id)).slice(0, 4)

  if (!byActress.length && !byGenre.length && !bySeries.length) return null

  const actressName = actresses[0]?.name
  const seriesName = series[0]?.name

  return (
    <div className="space-y-8 border-t border-[var(--border)] pt-8">
      {byActress.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {actressName ? `${actressName} の他の作品` : '同女優の他の作品'}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {byActress.map((a) => (
              <RelatedMiniCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {byGenre.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            同ジャンルの作品
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {byGenre.map((a) => (
              <RelatedMiniCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {bySeries.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
            {seriesName ? `「${seriesName}」シリーズ` : '同シリーズの作品'}
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {bySeries.map((a) => (
              <RelatedMiniCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
