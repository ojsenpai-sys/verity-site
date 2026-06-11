export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import Link from 'next/link'
import { Trophy, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { FavoriteButton } from '@/components/FavoriteButton'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, cidToCdnUrl, toHighResPackageUrl } from '@/lib/cidUtils'
import type { Actress, Article } from '@/lib/types'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const BASE     = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export const metadata: Metadata = {
  title: '人気AV女優ランキング【リアルタイム】| VERITY',
  description:
    'VERITYが集計するリアルタイム人気女優ランキング。クリック数・お気に入り登録数に基づくTOP10を毎日更新。各女優の最新作・代表作・FANZAリンクつき。',
  alternates: { canonical: `${BASE}/ranking` },
  openGraph: {
    title:       '人気AV女優ランキング【リアルタイム】| VERITY',
    description: 'VERITYが集計するリアルタイム人気女優ランキング TOP10',
  },
}

// ── 型定義 ────────────────────────────────────────────────────────────────────

type RankedActress = {
  rank:    number
  points:  number
  actress: Actress
}

// ── データ取得 ────────────────────────────────────────────────────────────────

async function getRanking(): Promise<RankedActress[]> {
  const supabase = await createClient()

  const { data: rankRows } = await supabase
    .rpc('get_actress_ranking', { p_brand_id: BRAND_ID, p_limit: 15 })

  if (rankRows && (rankRows as unknown[]).length > 0) {
    const rows        = rankRows as { actress_external_id: string; points: number }[]
    const externalIds = rows.map(r => r.actress_external_id)

    const { data: actresses } = await supabase
      .from('actresses')
      .select('id, external_id, name, ruby, image_url, metadata, is_active')
      .in('external_id', externalIds)
      .eq('is_active', true)

    const actressMap = new Map(
      ((actresses ?? []) as Actress[]).map(a => [a.external_id, a])
    )

    const live = rows
      .map((r, i) => {
        const actress = actressMap.get(r.actress_external_id)
        if (!actress) return null
        return { rank: i + 1, points: Number(r.points), actress }
      })
      .filter((r): r is RankedActress => r !== null)

    if (live.length > 0) return live
  }

  // フォールバック: キャッシュ参照
  const { data: latest } = await supabase
    .from('actress_ranking_cache')
    .select('snapshot_date')
    .eq('brand_id', BRAND_ID)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return []

  const { data: cache, error: cacheErr } = await supabase
    .from('actress_ranking_cache')
    .select('rank, points, actress_id, image_url')
    .eq('brand_id', BRAND_ID)
    .eq('snapshot_date', latest.snapshot_date)
    .order('rank', { ascending: true })
    .limit(15)

  if (cacheErr || !cache || cache.length === 0) return []

  const actressIds = cache.map(c => c.actress_id as string)
  const { data: actresses } = await supabase
    .from('actresses')
    .select('id, external_id, name, ruby, image_url, metadata, is_active')
    .in('id', actressIds)
    .eq('is_active', true)

  const actressMap = new Map(
    ((actresses ?? []) as Actress[]).map(a => [a.id, a])
  )

  return cache
    .map(c => {
      const actress = actressMap.get(c.actress_id as string)
      if (!actress) return null
      const merged: Actress = {
        ...actress,
        image_url: toHighResPackageUrl(c.image_url as string | null) ?? actress.image_url,
      }
      return { rank: c.rank as number, points: Number(c.points), actress: merged }
    })
    .filter((r): r is RankedActress => r !== null)
}

async function getLatestArticlesForActresses(
  actressNames: string[],
): Promise<Map<string, Article[]>> {
  if (actressNames.length === 0) return new Map()
  const supabase = await createClient()
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .overlaps('tags', actressNames)
    .lte('published_at', now)
    .order('published_at', { ascending: false })
    .limit(actressNames.length * 3)

  const result = new Map<string, Article[]>()
  for (const article of (data as Article[]) ?? []) {
    for (const name of actressNames) {
      if ((article.tags ?? []).includes(name)) {
        const existing = result.get(name) ?? []
        if (existing.length < 2) {
          result.set(name, [...existing, article])
        }
      }
    }
  }
  return result
}

// ── ランク装飾スタイル ─────────────────────────────────────────────────────────

const RANK_STYLES: Record<number, { border: string; badge: string; glow: string; crown?: boolean }> = {
  1: { border: 'border-amber-400/70',  badge: 'bg-amber-400 text-amber-900',   glow: 'shadow-[0_0_32px_rgba(251,191,36,0.35)]', crown: true },
  2: { border: 'border-slate-300/70',  badge: 'bg-slate-300 text-slate-800',   glow: 'shadow-[0_0_20px_rgba(203,213,225,0.2)]' },
  3: { border: 'border-amber-600/60',  badge: 'bg-amber-700 text-amber-100',   glow: 'shadow-[0_0_18px_rgba(180,83,9,0.25)]' },
}

// ── 女優画像 URL 解決 ─────────────────────────────────────────────────────────

function resolveImgSrc(actress: Actress): string | null {
  const raw = isBadImageUrl(actress.image_url) ? null : actress.image_url
  const url = toHighResPackageUrl(raw) ?? (() => {
    const cid = actress.metadata?.latest_cid as string | undefined
    return cid ? cidToCdnUrl(cid, 'pl') : null
  })()
  if (!url) return null
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

// ── ランキングカード ──────────────────────────────────────────────────────────

function RankingCard({
  item,
  articles,
  fanzaUrl,
}: {
  item:     RankedActress
  articles: Article[]
  fanzaUrl: string | null
}) {
  const { rank, actress } = item
  const imgSrc = resolveImgSrc(actress)
  const style  = RANK_STYLES[rank]

  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border bg-[var(--surface)]',
        'flex flex-col sm:flex-row gap-0 transition-all',
        style?.border ?? 'border-[var(--border)]',
        style?.glow   ?? '',
      ].join(' ')}
    >
      {/* ── 左: 女優画像 ── */}
      <Link
        href={`/verity/actresses/${actress.external_id}`}
        className="group relative shrink-0 w-full sm:w-36 aspect-[3/4] sm:aspect-auto overflow-hidden bg-[var(--surface-2)]"
      >
        {imgSrc ? (
          <>
            <ProxiedImage
              src={imgSrc}
              alt={actress.name}
              className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/70 via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-[var(--surface)]/30" />
          </>
        ) : (
          <NowPrinting />
        )}

        {/* ランクバッジ */}
        <div className="absolute top-2 left-2">
          {style ? (
            <span className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-full font-black text-sm shadow-lg',
              style.badge,
            ].join(' ')}>
              {style.crown ? '👑' : rank}
            </span>
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 font-bold text-xs text-white border border-white/20">
              {rank}
            </span>
          )}
        </div>
      </Link>

      {/* ── 右: 情報エリア ── */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* 女優名 + FavButton */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              href={`/verity/actresses/${actress.external_id}`}
              className="text-base font-bold text-[var(--text)] hover:text-[var(--magenta)] transition-colors"
            >
              {actress.name}
            </Link>
            {actress.ruby && (
              <p className="text-[11px] text-[var(--text-muted)]">{actress.ruby}</p>
            )}
          </div>
          <FavoriteButton
            type="actress"
            id={actress.external_id}
            meta={{ title: actress.name, href: `/verity/actresses/${actress.external_id}` }}
            size="md"
          />
        </div>

        {/* 最新作ミニカード群 */}
        {articles.length > 0 && (
          <div className="flex gap-2">
            {articles.slice(0, 2).map(art => {
              const proxyImg = art.image_url
                ? `/verity/api/proxy/image?url=${encodeURIComponent(art.image_url)}`
                : null
              return (
                <Link
                  key={art.id}
                  href={`/verity/articles/${art.slug}`}
                  className="group/mini relative w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--magenta)]/40 transition-colors"
                >
                  <div className="aspect-[2/3]">
                    {proxyImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proxyImg}
                        alt={art.title}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover/mini:scale-105"
                      />
                    ) : (
                      <div className="h-full w-full bg-[var(--surface)]" />
                    )}
                  </div>
                  <p className="p-1 text-[8px] leading-tight text-[var(--text-muted)] line-clamp-2">
                    {art.title}
                  </p>
                </Link>
              )
            })}
          </div>
        )}

        {/* FANZA CTAボタン */}
        {fanzaUrl && (
          <FanzaLink
            href={fanzaUrl}
            targetId={actress.external_id}
            position="ranking_page_direct"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_16px_rgba(14,165,233,0.35)] hover:shadow-[0_0_24px_rgba(14,165,233,0.6)] hover:brightness-110 active:scale-95 transition-all"
          >
            <ExternalLink size={12} />
            FANZAで{actress.name}の作品を見る
          </FanzaLink>
        )}
      </div>
    </div>
  )
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function RankingPage() {
  const [ranking, isOverseas] = await Promise.all([
    getRanking(),
    getIsOverseasUser(),
  ])

  const actressNames = ranking.map(r => r.actress.name)
  const articlesMap  = await getLatestArticlesForActresses(actressNames)

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">

      {/* ── ヘッダー ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Trophy size={22} className="text-amber-400" />
          <h1 className="text-2xl font-black text-[var(--text)]">
            人気AV女優ランキング
          </h1>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
            Top {ranking.length}
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          VERITYの実クリック数・お気に入り登録数を基にリアルタイム集計。毎日更新。
        </p>
      </div>

      {/* ── ランキングリスト ── */}
      {ranking.length === 0 ? (
        <p className="text-[var(--text-muted)]">ランキングデータがありません</p>
      ) : (
        <div className="space-y-4">
          {ranking.map(item => {
            const dmmId  = item.actress.external_id.replace('dmm-actress-', '')
            const rawUrl = `https://www.dmm.co.jp/digital/videoa/-/list/=/article=actress/id=${dmmId}/`
            const fanzaUrl = withAffiliateForRegion(rawUrl, isOverseas)
            const articles = articlesMap.get(item.actress.name) ?? []

            return (
              <RankingCard
                key={item.actress.id}
                item={item}
                articles={articles}
                fanzaUrl={fanzaUrl}
              />
            )
          })}
        </div>
      )}

      {/* ── フッター注記 ── */}
      <p className="text-center text-[11px] text-[var(--text-muted)]">
        <span className="rounded px-1.5 py-0.5 font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">PR</span>
        {' '}FANZAへのリンクはアフィリエイトリンクです
      </p>

      <div className="flex justify-center">
        <Link
          href="/"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          ← トップへ戻る
        </Link>
      </div>
    </div>
  )
}
