export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { Trophy, ExternalLink, Info, Heart, Flame, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { FavoriteButton } from '@/components/FavoriteButton'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, cidToCdnUrl, toHighResPackageUrl, coverPosClass } from '@/lib/cidUtils'
import type { Actress, Article } from '@/lib/types'

// ── i18n ──────────────────────────────────────────────────────────────────────

type Lang = 'ja' | 'en' | 'zh'

function getLang(raw: string | undefined | null): Lang {
  if (raw === 'en') return 'en'
  if (raw === 'zh') return 'zh'
  return 'ja'
}

const SCORING_NOTE: Record<Lang, string> = {
  ja: '※VERITY人気女優ランキングは、直近のページ閲覧数（1pt）、FANZA作品詳細へのアクセス（10pt）、およびお気に入り登録（50pt）を総合した『熱量スコア』によって毎日リアルタイムに自動集計されています。あなたの『お気に入り登録』が、推し女優の順位を押し上げる最大の原動力になります。',
  en: "*The VERITY Popular Actress Ranking is automatically calculated in real-time based on Recent Views (1pt), FANZA Link Clicks (10pt), and Favorites (50pt). Your 'Favorite' registration is the biggest power to boost your favorite actress!",
  zh: '※VERITY人气女优排行榜是根据最近的页面浏览量（1pt）、访问FANZA作品详情（10pt）以及收藏夹注册（50pt）综合的『热度得分』每天实时自动统计的。您的『收藏』是提升您最喜爱的女优排名的最大动力。',
}

function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 p-0.5 text-[11px]">
      <a href="?"        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'ja' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>JP</a>
      <a href="?lang=en" className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'en' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>EN</a>
      <a href="?lang=zh" className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'zh' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>中文</a>
    </div>
  )
}

// ── 型定義 ────────────────────────────────────────────────────────────────────

type RankedActress = {
  rank:    number
  points:  number
  actress: Actress
}

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const BASE     = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang: lp } = await searchParams
  const lang = getLang(lp)

  const titles: Record<Lang, string> = {
    ja: '人気AV女優ランキング【リアルタイム熱量スコア】| VERITY',
    en: 'Popular Actress Ranking [Real-time Heat Score] | VERITY',
    zh: '人气女优排行榜【实时热度得分】| VERITY',
  }
  const descs: Record<Lang, string> = {
    ja: 'VERITYが閲覧数・FANZAクリック・お気に入り登録を総合した熱量スコアでリアルタイム集計。お気に入り登録で推し女優の順位をブーストできます。',
    en: 'VERITY real-time ranking based on views, FANZA clicks, and favorites. Boost your favorite actress by adding her to your favorites!',
    zh: 'VERITY基于浏览量、FANZA点击和收藏综合计算的实时排行榜。收藏您喜爱的女优，帮助她提升排名！',
  }

  return {
    title:       titles[lang],
    description: descs[lang],
    alternates:  { canonical: `${BASE}/ranking` },
    openGraph: {
      title:       titles[lang],
      description: descs[lang],
    },
  }
}

// ── データ取得 ────────────────────────────────────────────────────────────────

async function getRanking(): Promise<RankedActress[]> {
  const supabase = await createClient()

  // キャッシュ優先: cron で定期更新されるスナップショットを即座に返す
  // RPC はフルスキャンで重いため、キャッシュが空の場合のみ呼ぶ
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

type FavRankRow = {
  actress_id:     string
  external_id:    string
  name:           string
  image_url:      string | null
  ruby:           string | null
  favorite_count: number
}

async function getFavoriteRanking(): Promise<FavRankRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_actress_favorite_ranking', { p_limit: 20 })
  if (error) { console.error('[fav-ranking]', error.message); return [] }
  return (data ?? []) as FavRankRow[]
}

// ── 人気作品ランキング（熱量×トレンドスコア / 031 RPC） ──────────────────────
// anon は user_events を直接参照できないため SECURITY DEFINER RPC 経由で集計値を取得。
// RPC 未適用時は空配列 → セクション非表示（既存ランキングと同じグレースフル劣化）。

type RankedWork = {
  rank:    number
  points:  number
  article: Article
}

async function getWorksRanking(): Promise<RankedWork[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_top_works_ranked', { p_limit: 10 })
  if (error) { console.error('[works-ranking]', error.message); return [] }
  const rows = (data ?? []) as { external_id: string; points: number }[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r.external_id)
  const { data: articles } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, slug, tags, metadata, source')
    .in('external_id', ids)
    .eq('is_active', true)

  const map = new Map(((articles ?? []) as Article[]).map(a => [a.external_id, a]))

  return rows
    .map(r => {
      const article = map.get(r.external_id)
      return article ? { points: Number(r.points), article } : null
    })
    .filter((r): r is Omit<RankedWork, 'rank'> => r !== null)
    .map((r, i) => ({ rank: i + 1, ...r }))
}

// 出演女優名を metadata.actress / actress_name から抽出
function workActressNames(article: Article): string[] {
  const meta = article.metadata as Record<string, unknown> | null
  if (Array.isArray(meta?.actress)) {
    return (meta!.actress as { name?: string }[]).map(a => a.name ?? '').filter(Boolean)
  }
  if (typeof meta?.actress_name === 'string') return [meta.actress_name as string]
  return []
}

async function getLatestArticlesForActresses(
  actressNames: string[],
): Promise<Map<string, Article[]>> {
  if (actressNames.length === 0) return new Map()
  const supabase = await createClient()
  const now = new Date().toISOString()

  const results = await Promise.all(
    actressNames.map(async (name) => {
      const { data } = await supabase
        .from('articles')
        .select('id, external_id, title, image_url, published_at, slug, tags')
        .eq('is_active', true)
        .contains('tags', [name])
        .lte('published_at', now)
        .order('published_at', { ascending: false })
        .limit(2)
      return { name, articles: (data as Article[]) ?? [] }
    }),
  )

  return new Map(results.map(r => [r.name, r.articles]))
}

// ── ランク装飾スタイル ─────────────────────────────────────────────────────────

const RANK_STYLES: Record<number, { border: string; badge: string; glow: string; crown?: boolean }> = {
  1: { border: 'border-amber-400/70',  badge: 'bg-amber-400 text-amber-900',   glow: 'shadow-[0_0_32px_rgba(251,191,36,0.35)]', crown: true },
  2: { border: 'border-slate-300/70',  badge: 'bg-slate-300 text-slate-800',   glow: 'shadow-[0_0_20px_rgba(203,213,225,0.2)]' },
  3: { border: 'border-amber-600/60',  badge: 'bg-amber-700 text-amber-100',   glow: 'shadow-[0_0_18px_rgba(180,83,9,0.25)]' },
}

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
  lang,
}: {
  item:     RankedActress
  articles: Article[]
  fanzaUrl: string | null
  lang:     Lang
}) {
  const { rank, actress } = item
  const actressImgSrc = resolveImgSrc(actress)
  const fallbackImgSrc = !actressImgSrc && articles.length > 0 && articles[0].image_url
    ? `/verity/api/proxy/image?url=${encodeURIComponent(toHighResPackageUrl(articles[0].image_url) ?? articles[0].image_url)}`
    : null
  const imgSrc = actressImgSrc ?? fallbackImgSrc
  const style  = RANK_STYLES[rank]

  const ctaLabel: Record<Lang, string> = {
    ja: `FANZAで${actress.name}の作品を見る`,
    en: `Browse ${actress.name} on FANZA`,
    zh: `在FANZA查看${actress.name}的作品`,
  }

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
        className={`group relative shrink-0 w-full aspect-[3/4] sm:aspect-auto overflow-hidden bg-[var(--surface-2)] ${rank === 1 ? 'sm:w-52' : 'sm:w-36'}`}
      >
        {imgSrc ? (
          <>
            <ProxiedImage
              src={imgSrc}
              alt={actress.name}
              className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(actress.image_url)} transition-transform duration-300 group-hover:scale-105`}
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
              const hiResUrl = toHighResPackageUrl(art.image_url) ?? art.image_url
              const proxyImg = hiResUrl
                ? `/verity/api/proxy/image?url=${encodeURIComponent(hiResUrl)}`
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
                        className={`h-full w-full object-cover ${coverPosClass(art.image_url)} transition-transform duration-200 group-hover/mini:scale-105`}
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
            {ctaLabel[lang]}
          </FanzaLink>
        )}
      </div>
    </div>
  )
}

// ── 人気作品ランキングカード ──────────────────────────────────────────────────

function WorkRankingCard({
  item,
  fanzaUrl,
  lang,
}: {
  item:     RankedWork
  fanzaUrl: string | null
  lang:     Lang
}) {
  const { rank, points, article } = item
  const names = workActressNames(article)
  const style = RANK_STYLES[rank]

  // 表紙: pl.jpg（横長スプレッド・表紙は右側）のまま coverPosClass→object-right で表示。
  // ※jp.jpg化は不可: jp未存在の作品でプロキシが pl にフォールバックし、object-center だと
  //   背表紙が中央に出てしまう。ArticleCard/女優カードと同じ単一チョークポイント規約に統一。
  const cover = !isBadImageUrl(article.image_url)
    ? (toHighResPackageUrl(article.image_url) ?? article.image_url)
    : cidToCdnUrl(article.external_id, 'pl')
  const imgSrc = cover
    ? `/verity/api/proxy/image?url=${encodeURIComponent(cover)}`
    : null

  const ctaLabel: Record<Lang, string> = {
    ja: 'FANZAでサンプル視聴',
    en: 'Watch sample on FANZA',
    zh: '在FANZA观看样片',
  }

  const ImageInner = (
    <>
      {imgSrc ? (
        <>
          <ProxiedImage
            src={imgSrc}
            alt={article.title}
            className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(cover)} transition-transform duration-300 group-hover:scale-105`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />
        </>
      ) : (
        <NowPrinting />
      )}

      {/* 順位バッジ */}
      <div className="absolute left-2 top-2">
        {style ? (
          <span className={['inline-flex h-7 w-7 items-center justify-center rounded-full font-black text-xs shadow-lg', style.badge].join(' ')}>
            {style.crown ? '👑' : rank}
          </span>
        ) : (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/70 text-[11px] font-bold text-white">
            {rank}
          </span>
        )}
      </div>

      {/* 永続 FANZA バッジ（Playアイコン・hoverでマゼンタ化） */}
      {fanzaUrl && (
        <span
          className="pointer-events-none absolute bottom-2 left-2 z-[5] inline-flex items-center gap-1
                     rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm
                     ring-1 ring-white/15 shadow-[0_2px_6px_rgba(0,0,0,0.4)] transition-all duration-200
                     group-hover:bg-[var(--magenta)]/90 group-hover:ring-[var(--magenta)]/40"
        >
          <Play size={9} className="fill-white" /> FANZA
        </span>
      )}

      {/* 戦闘力ポイント */}
      <span className="absolute bottom-2 right-2 z-[5] inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black text-amber-300 ring-1 ring-amber-400/30 backdrop-blur-sm">
        <Flame size={9} className="fill-amber-400 text-amber-400" />
        {points.toLocaleString()}
      </span>
    </>
  )

  const imageWrapClass = 'group relative aspect-[2/3] w-full overflow-hidden bg-[var(--surface-2)]'

  return (
    <div className={[
      'flex flex-col overflow-hidden rounded-xl border bg-[var(--surface)] transition-all hover:-translate-y-0.5',
      style?.border ?? 'border-[var(--border)]',
      style?.glow   ?? 'hover:border-[var(--magenta)]/40 hover:shadow-[0_0_16px_rgba(226,0,116,0.15)]',
    ].join(' ')}>
      {/* 画像（FANZA送客 or 作品詳細へ） */}
      {fanzaUrl ? (
        <FanzaLink href={fanzaUrl} targetId={article.external_id} position="ranking_works_image" className={imageWrapClass}>
          {ImageInner}
        </FanzaLink>
      ) : article.slug ? (
        <Link href={`/verity/articles/${article.slug}`} className={imageWrapClass}>
          {ImageInner}
        </Link>
      ) : (
        <div className={imageWrapClass}>{ImageInner}</div>
      )}

      {/* テキスト + CTA */}
      <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-2">
        {article.slug ? (
          <Link href={`/verity/articles/${article.slug}`} className="line-clamp-2 text-[11px] font-semibold leading-tight text-[var(--text)] transition-colors hover:text-[var(--magenta)]">
            {article.title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-[var(--text)]">{article.title}</p>
        )}

        {names.length > 0 && (
          <p className="truncate text-[10px] text-[var(--magenta)]">{names.join('・')}</p>
        )}

        {fanzaUrl && (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position="ranking_works_cta"
            className="mt-auto inline-flex items-center justify-center gap-1 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 px-2.5 py-1.5 text-[10px] font-bold text-white transition-all hover:from-pink-500 hover:to-rose-500 hover:shadow-[0_0_14px_rgba(225,29,72,0.5)] active:scale-95"
          >
            <Play size={10} className="fill-white" />
            {ctaLabel[lang]}
          </FanzaLink>
        )}
      </div>
    </div>
  )
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const { lang: lp } = await searchParams
  const lang = getLang(lp)

  const [ranking, isOverseas, favRanking, worksRanking] = await Promise.all([
    getRanking(),
    getIsOverseasUser(),
    getFavoriteRanking(),
    getWorksRanking(),
  ])

  const actressNames = ranking.map(r => r.actress.name)
  const articlesMap  = await getLatestArticlesForActresses(actressNames)

  const headerText: Record<Lang, string> = {
    ja: '人気AV女優ランキング',
    en: 'Popular Actress Ranking',
    zh: '人气女优排行榜',
  }
  const subText: Record<Lang, string> = {
    ja: '閲覧数・FANZAクリック・お気に入りを総合した熱量スコアでリアルタイム集計',
    en: 'Real-time ranking based on views, FANZA clicks, and favorites',
    zh: '基于浏览量、FANZA点击和收藏综合计算的实时排行榜',
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">

      {/* ── ヘッダー ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Trophy size={22} className="text-amber-400" />
            <h1 className="text-2xl font-black text-[var(--text)]">
              {headerText[lang]}
            </h1>
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
              Top {ranking.length}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {subText[lang]}
          </p>
        </div>
        <LangSwitch lang={lang} />
      </div>

      {/* ── ランキングリスト ── */}
      {ranking.length === 0 ? (
        <p className="text-[var(--text-muted)]">ランキングデータがありません</p>
      ) : (
        <div className="space-y-4">
          {ranking.map(item => {
            const dmmId    = item.actress.external_id.replace('dmm-actress-', '')
            const rawUrl   = `https://www.dmm.co.jp/digital/videoa/-/list/=/article=actress/id=${dmmId}/`
            const fanzaUrl = withAffiliateForRegion(rawUrl, isOverseas)
            const articles = articlesMap.get(item.actress.name) ?? []

            return (
              <RankingCard
                key={item.actress.id}
                item={item}
                articles={articles}
                fanzaUrl={fanzaUrl}
                lang={lang}
              />
            )
          })}
        </div>
      )}

      {/* ── 集計基準アナウンスエリア ── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 px-5 py-4 space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
          <Info size={12} />
          {lang === 'ja' ? '集計基準について' : lang === 'en' ? 'About Ranking Criteria' : '关于排名标准'}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {SCORING_NOTE[lang]}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { label: lang === 'ja' ? 'ページ閲覧'  : lang === 'en' ? 'Page View'    : '浏览',   pt: '1pt'  },
            { label: lang === 'ja' ? 'FANZAクリック': lang === 'en' ? 'FANZA Click'  : 'FANZA点击', pt: '10pt' },
            { label: lang === 'ja' ? 'お気に入り'  : lang === 'en' ? 'Add Favorite' : '收藏',   pt: '50pt' },
          ].map(({ label, pt }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-mono"
            >
              <span className="text-[var(--text-muted)]">{label}</span>
              <span className="font-bold text-[var(--magenta)]">{pt}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── お気に入り数ランキング ── */}
      {favRanking.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Heart size={16} className="text-[var(--magenta)]" style={{ fill: 'var(--magenta)' }} />
            <h2 className="text-base font-black text-[var(--text)]">
              {lang === 'ja' ? 'お気に入り数ランキング'
               : lang === 'en' ? 'Most Favorited Actresses'
               : '收藏数排行榜'}
            </h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2.5 py-0.5 text-[11px] font-bold text-[var(--magenta)]">
              TOP {favRanking.filter(r => r.favorite_count > 0).length}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {lang === 'ja' ? 'VERITYユーザーのお気に入り登録数による純粋なランキング。熱量スコアとは異なる指標です。'
             : lang === 'en' ? 'Pure ranking by number of VERITY users who added each actress to their favorites.'
             : '基于VERITY用户收藏数量的纯粹排行榜，与热度分数不同。'}
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {favRanking.map((row, i) => {
              const imgSrc = (() => {
                const hi = toHighResPackageUrl(row.image_url)
                if (!hi || isBadImageUrl(hi)) return null
                return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
              })()

              return (
                <Link
                  key={row.actress_id}
                  href={`/verity/actresses/${row.external_id}`}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-all hover:-translate-y-0.5 hover:border-[var(--magenta)]/40 hover:shadow-[0_0_16px_rgba(226,0,116,0.15)]"
                >
                  {/* 画像（ps.jpg → pl.jpg に高解像度化） */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-[var(--surface-2)]">
                    {imgSrc ? (
                      <>
                        <ProxiedImage
                          src={imgSrc}
                          alt={row.name}
                          className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(row.image_url)} transition-transform duration-300 group-hover:scale-105`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/70 via-transparent to-transparent" />
                      </>
                    ) : (
                      <NowPrinting />
                    )}

                    {/* 順位バッジ */}
                    <span
                      className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black"
                      style={
                        i === 0
                          ? { background: '#f59e0b', color: '#451a03' }
                          : i === 1
                            ? { background: '#94a3b8', color: '#0f172a' }
                            : i === 2
                              ? { background: '#92400e', color: '#fef3c7' }
                              : { background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }
                      }
                    >
                      {i + 1}
                    </span>
                  </div>

                  {/* テキスト */}
                  <div className="flex flex-col gap-0.5 px-2.5 py-2">
                    <p className="truncate text-xs font-semibold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors">
                      {row.name}
                    </p>
                    {row.ruby && (
                      <p className="truncate text-[9px] text-[var(--text-muted)]">{row.ruby}</p>
                    )}
                    <div className="mt-1 flex items-center gap-1">
                      <Heart size={9} className="shrink-0 text-[var(--magenta)]" style={{ fill: 'var(--magenta)' }} />
                      <span className="text-[10px] font-bold text-[var(--magenta)]">
                        {row.favorite_count.toLocaleString()}
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)]">
                        {lang === 'ja' ? '人' : lang === 'en' ? 'fans' : '人'}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 人気作品ランキング TOP10 ── */}
      {worksRanking.length > 0 && (
        <section className="space-y-4 border-t border-[var(--border)] pt-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Flame size={18} className="text-amber-400" style={{ fill: 'rgba(251,191,36,0.4)' }} />
              <h2 className="text-base font-black text-[var(--text)]">
                {lang === 'ja' ? '人気作品ランキング'
                 : lang === 'en' ? 'Popular Works Ranking'
                 : '人气作品排行榜'}
              </h2>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-400">
                TOP {worksRanking.length}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {lang === 'ja' ? '直近14日のユーザー行動（閲覧・サンプル視聴・出演女優お気に入り）をトレンド減衰で集計した『総合戦闘力』ランキング。'
               : lang === 'en' ? "Ranked by 'total power' aggregating the last 14 days of user activity (views, sample plays, cast favorites) with trend decay."
               : '根据最近14天的用户行为（浏览、样片观看、出演女优收藏）以趋势衰减综合计算的『总合战斗力』排行榜。'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
            {worksRanking.map(item => {
              const meta = item.article.metadata as Record<string, unknown> | null
              const rawUrl =
                typeof meta?.affiliate_url === 'string' ? meta.affiliate_url
                : typeof meta?.url === 'string' && item.article.source === 'dmm' ? (meta.url as string)
                : null
              const fanzaUrl = withAffiliateForRegion(rawUrl, isOverseas)
              return (
                <WorkRankingCard
                  key={item.article.id}
                  item={item}
                  fanzaUrl={fanzaUrl}
                  lang={lang}
                />
              )
            })}
          </div>

          {/* 作品スコア内訳チップ */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: lang === 'ja' ? 'ページ閲覧' : lang === 'en' ? 'Page View'    : '浏览',       pt: '1pt'  },
              { label: lang === 'ja' ? 'サンプル視聴' : lang === 'en' ? 'Sample Play'  : '样片观看',   pt: '5pt'  },
              { label: lang === 'ja' ? '女優お気に入り' : lang === 'en' ? 'Cast Favorite' : '女优收藏', pt: '20pt' },
            ].map(({ label, pt }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-mono"
              >
                <span className="text-[var(--text-muted)]">{label}</span>
                <span className="font-bold text-amber-400">{pt}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── フッター ── */}
      <p className="text-center text-[11px] text-[var(--text-muted)]">
        <span className="rounded px-1.5 py-0.5 font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">PR</span>
        {' '}{lang === 'ja' ? 'FANZAへのリンクはアフィリエイトリンクです' : lang === 'en' ? 'FANZA links are affiliate links' : 'FANZA链接为推广链接'}
      </p>

      <div className="flex justify-center">
        <Link
          href="/"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          ← {lang === 'ja' ? 'トップへ戻る' : lang === 'en' ? 'Back to Top' : '返回首页'}
        </Link>
      </div>
    </div>
  )
}
