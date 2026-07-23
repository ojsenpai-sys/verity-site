import Link from 'next/link'
import { Clapperboard, ChevronRight, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass } from '@/lib/cidUtils'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'
import { ProxiedImage } from '@/components/ProxiedImage'
import { FanzaLink } from '@/components/FanzaLink'
import { ActressLink } from '@/components/ActressLink'
import { actressExternalIdFromNumericId, actressPageHref } from '@/lib/actressUrl'
import type { Article } from '@/lib/types'

const BASE_SELECT =
  'id, title, slug, external_id, image_url, source, metadata, published_at, tags, is_active, category, summary, content, fetched_at'

const DISPLAY_MAX = 6

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

/** 表示用ジャケット URL 解決（image_url → 同人書影 → CID から再構築）。 */
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

/** 動画配信作品か（DVD/同人は非動画扱いで後ろへ）。 */
function isVideoWork(a: Article): boolean {
  const meta  = a.metadata as Record<string, unknown> | null
  const floor = typeof meta?.floor === 'string' ? (meta.floor as string) : null
  const url   = typeof meta?.url === 'string' ? (meta.url as string) : ''
  if (floor === 'dvd' || url.includes('/mono/dvd/')) return false
  if (url.includes('/dc/doujin/')) return false
  return true
}

type MetaActress = { id: number; name: string }

type Props = {
  actresses:   MetaActress[]
  currentSlug: string
  currentCid:  string
}

/**
 * 「この女優の出演作品」セクション。
 *   - 主要女優 1 名（最初の id>0、無ければ最初の女優）を優先し、その出演作品を最大 6 件表示。
 *   - 抽出: tags に女優名を含む(overlaps) ∧ is_active ∧ 現作品除外。動画作品を優先し
 *     同一品番は digital 優先で重複排除。
 *   - カードは画像/タイトル→VERITY内作品ページ（内部回遊優先）、別途 FANZA ボタン。
 *   - 見出しの女優名リンクと末尾 CTA から女優ページへ（actress_click 計測）。
 *   - 女優情報が無い / 該当作品が無い場合は何も表示しない。
 */
export async function SameActressWorks({ actresses, currentSlug, currentCid }: Props) {
  const named = actresses.filter((a) => a.name && a.name.trim().length > 0)
  if (named.length === 0) return null

  const primary = named.find((a) => a.id > 0) ?? named[0]
  const hasPage = primary.id > 0
  const externalId = hasPage ? actressExternalIdFromNumericId(primary.id) : null

  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select(BASE_SELECT)
    .overlaps('tags', [primary.name])
    .neq('slug', currentSlug)
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .limit(24)

  let rows = (data ?? []) as Article[]
  rows = deduplicateDigitalFirst(rows).filter((r) => r.external_id !== currentCid)
  // 動画作品を優先（DVD/同人は後方へ・各群の発売日降順は維持）
  const works = [...rows.filter(isVideoWork), ...rows.filter((r) => !isVideoWork(r))].slice(0, DISPLAY_MAX)

  if (works.length === 0) return null

  const ctaHref = hasPage ? actressPageHref(externalId!) : `/?tag=${encodeURIComponent(primary.name)}`

  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-8">
      <div className="flex items-center gap-2.5">
        <Clapperboard size={15} className="text-[var(--magenta)]" />
        <h2 className="text-base font-bold tracking-tight text-[var(--text)]">
          {hasPage && externalId ? (
            <ActressLink
              href={actressPageHref(externalId)}
              actressId={externalId}
              actressName={primary.name}
              position="work_same_actress_card"
              sectionType="same_actress_card"
              actressCount={named.length}
              sourceCid={currentCid}
              sourceSlug={currentSlug}
              className="text-[var(--magenta)] transition-colors hover:underline"
            >
              {primary.name}
            </ActressLink>
          ) : (
            <span className="text-[var(--magenta)]">{primary.name}</span>
          )}
          <span className="text-[var(--text)]">の出演作品</span>
        </h2>
        <span className="rounded-full bg-[var(--magenta)]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--magenta)]">
          Same Actress
        </span>
      </div>

      {/* モバイルは横スクロール / sm 以上はグリッド */}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {works.map((w) => {
          const img   = articleImage(w)
          const fanza = articleFanzaUrl(w)
          const imgEl = img ? (
            <ProxiedImage
              src={proxyUrl(img)}
              alt={w.title}
              loading="lazy"
              className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(w.image_url)} transition-transform duration-300 group-hover/img:scale-[1.05]`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--text-muted)]">
              NO IMAGE
            </div>
          )

          return (
            <div key={w.id} className="flex w-32 shrink-0 flex-col gap-1.5 sm:w-auto">
              {/* 画像 → VERITY内作品ページ（内部回遊優先） */}
              <Link
                href={`/verity/articles/${w.slug}`}
                aria-label={w.title}
                className="group/img relative block aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]"
              >
                {imgEl}
              </Link>
              {/* タイトル → VERITY内作品ページ */}
              <Link
                href={`/verity/articles/${w.slug}`}
                className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text)] transition-colors hover:text-[var(--magenta)]"
              >
                {w.title}
              </Link>
              {/* 別ボタン → FANZA（fanza_click） */}
              {fanza && (
                <FanzaLink
                  href={fanza}
                  targetId={w.external_id}
                  position="work_same_actress_fanza"
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-[var(--magenta)]/45 px-2 py-0.5 text-[10px] font-bold text-[var(--magenta)] transition-colors hover:bg-[var(--magenta)]/10"
                >
                  FANZA
                  <ExternalLink size={9} />
                </FanzaLink>
              )}
            </div>
          )
        })}
      </div>

      {/* 女優ページ CTA */}
      {hasPage && externalId ? (
        <ActressLink
          href={actressPageHref(externalId)}
          actressId={externalId}
          actressName={primary.name}
          position="work_same_actress_section"
          sectionType="same_actress_section"
          actressCount={named.length}
          sourceCid={currentCid}
          sourceSlug={currentSlug}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[var(--magenta)] transition-colors hover:underline"
        >
          {primary.name}のプロフィール・全作品を見る
          <ChevronRight size={14} />
        </ActressLink>
      ) : (
        <Link
          href={ctaHref}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[var(--magenta)] transition-colors hover:underline"
        >
          {primary.name}の作品をもっと見る
          <ChevronRight size={14} />
        </Link>
      )}
    </section>
  )
}
