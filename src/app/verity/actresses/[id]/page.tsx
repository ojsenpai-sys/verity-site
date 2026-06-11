export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, ShoppingCart, Bookmark, UserCircle, Tag, Flame, ExternalLink, Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { LogView } from '@/components/LogView'
import { ShareButton } from '@/components/ShareButton'
import { FavoriteButton } from '@/components/FavoriteButton'
import { withAffiliate, withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { FanzaLink } from '@/components/FanzaLink'
import { PurchaseLink } from '@/components/PurchaseLink'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'
import { ActressDiscoveryBlock } from './ActressDiscoveryBlock'
import type { Article, Actress } from '@/lib/types'

// ── i18n ──────────────────────────────────────────────────────────────────────

type Lang = 'ja' | 'en' | 'zh'
type Params = { id: string }

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

function getLang(raw: string | undefined | null): Lang {
  if (raw === 'en') return 'en'
  if (raw === 'zh') return 'zh'
  return 'ja'
}

type Strs = {
  metaTitle:      (name: string, month: number) => string
  metaDesc:       (name: string) => string
  backHome:       string
  backProfile:    string
  works:          (n: number) => string
  preOrder:       string
  preOrderBadge:  string
  recent:         string
  recentBadge:    string
  fanzaSearch:    (name: string) => string
  saleSection:    string
  saleBadge:      string
  noSale:         string
  fanzaSaleLink:  (name: string) => string
  genreCatalog:   string
  genreBadge:     (name: string) => string
  ctaTitle:       (name: string) => string
  ctaSub:         string
  ctaBtn:         string
  prText:         string
  rankBoostNote:  string
  rankBoostLink:  string
}

const I18N: Record<Lang, Strs> = {
  ja: {
    metaTitle:     (name, month) => `【${month}月最新】${name}の神作・出演動画まとめ！今すぐ使えるセール作品・無料サンプル情報【VERITY】`,
    metaDesc:      (name) => `${name}の最新作・セール中作品・無料サンプル動画を徹底まとめ。FANZAで視聴できる${name}出演AV作品をVERITY編集部がキュレーション。`,
    backHome:      'ダッシュボードへ戻る',
    backProfile:   'マイページへ戻る',
    works:         (n) => `最新 ${n} 作品を表示`,
    preOrder:      '予約受付中',
    preOrderBadge: '先行予約',
    recent:        '最新作・準新作',
    recentBadge:   '今、買うべき作品',
    fanzaSearch:   (name) => `FANZAで${name}の全作品を検索`,
    saleSection:   'セール中の作品',
    saleBadge:     '期間限定',
    noSale:        '現在セール中の作品はありません',
    fanzaSaleLink: (name) => `FANZAで${name}のセール作品をもっと見る`,
    genreCatalog:  'ジャンル別カタログ',
    genreBadge:    (name) => `${name} × ジャンル`,
    ctaTitle:      (name) => `${name}の全作品を今すぐチェック`,
    ctaSub:        '高画質・サンプル動画あり — 無料会員登録でポイントプレゼント中',
    ctaBtn:        'FANZAで見る — 無料サンプルあり',
    prText:        'アフィリエイト広告を含みます',
    rankBoostNote: 'お気に入り登録すると、この女優のランキングが +50pt ブーストされます',
    rankBoostLink: 'ランキングを見る',
  },
  en: {
    metaTitle:     (name, month) => `【Latest ${MONTHS_EN[month - 1]}】${name} Complete Works & Best Video Selection | VERITY`,
    metaDesc:      (name) => `Browse all ${name} videos on FANZA. Latest releases, sale picks & free sample movies curated by VERITY.`,
    backHome:      'Back to Dashboard',
    backProfile:   'My Page',
    works:         (n) => `Showing ${n} works`,
    preOrder:      'Pre-order Available',
    preOrderBadge: 'Pre-order',
    recent:        'Latest Releases',
    recentBadge:   'Must-buy Now',
    fanzaSearch:   (name) => `Browse all ${name} works on FANZA`,
    saleSection:   'On Sale Now',
    saleBadge:     'Limited Time',
    noSale:        'No items currently on sale',
    fanzaSaleLink: (name) => `See more ${name} sale items on FANZA`,
    genreCatalog:  'Genre Catalog',
    genreBadge:    (name) => `${name} × Genre`,
    ctaTitle:      (name) => `Browse All ${name} Works Now`,
    ctaSub:        'HD quality & free sample movies — sign up free to receive bonus points',
    ctaBtn:        'Watch on FANZA — Free Sample Available',
    prText:        'Contains affiliate links',
    rankBoostNote: 'Add to Favorites to boost this actress\'s VERITY ranking by +50pt',
    rankBoostLink: 'See Ranking',
  },
  zh: {
    metaTitle:     (name, month) => `【${month}月最新】${name} 的所有作品和精彩视频推荐 | VERITY`,
    metaDesc:      (name) => `浏览${name}在FANZA上的所有视频。VERITY编辑部精选最新发售、特价和免费试看视频。`,
    backHome:      '返回首页',
    backProfile:   '我的主页',
    works:         (n) => `显示最新 ${n} 部作品`,
    preOrder:      '预约受付中',
    preOrderBadge: '预约',
    recent:        '最新作品',
    recentBadge:   '现在必买',
    fanzaSearch:   (name) => `在FANZA搜索${name}的全部作品`,
    saleSection:   '特价中的作品',
    saleBadge:     '限时特价',
    noSale:        '目前没有特价作品',
    fanzaSaleLink: (name) => `在FANZA查看更多${name}的特价作品`,
    genreCatalog:  '按类型分类',
    genreBadge:    (name) => `${name} × 类型`,
    ctaTitle:      (name) => `立即查看${name}的全部作品`,
    ctaSub:        '高画质・有试看视频 — 免费注册即送积分',
    ctaBtn:        '在FANZA观看 — 有免费试看',
    prText:        '含有推广链接',
    rankBoostNote: '收藏后，此女优的VERITY排名将提升 +50pt',
    rankBoostLink: '查看排名',
  },
}

function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 p-0.5 text-[11px]"
      aria-label="Language"
    >
      <a
        href="?"
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'ja' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        JP
      </a>
      <a
        href="?lang=en"
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'en' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        EN
      </a>
      <a
        href="?lang=zh"
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'zh' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        中文
      </a>
    </div>
  )
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
  searchParams,
}: {
  params:       Promise<Params>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id }      = await params
  const { lang: lp } = await searchParams
  const lang         = getLang(lp)
  const t            = I18N[lang]

  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('name, ruby, image_url, metadata')
    .eq('external_id', id)
    .single()
  if (!data) return {}
  const BASE  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
  const meta  = data.metadata as Record<string, unknown> | null
  const month = new Date().getMonth() + 1

  const keywords = Array.isArray(meta?.seo_keywords)
    ? (meta!.seo_keywords as string[])
    : undefined

  const title = lang === 'ja'
    ? ((meta?.seo_title as string | undefined) ?? t.metaTitle(data.name, month))
    : t.metaTitle(data.name, month)

  const description = lang === 'ja'
    ? ((meta?.seo_description as string | undefined) ?? t.metaDesc(data.name))
    : t.metaDesc(data.name)

  return {
    title,
    description,
    ...(keywords && lang === 'ja' ? { keywords } : {}),
    alternates: { canonical: `${BASE}/actresses/${id}` },
    openGraph: {
      title:       `${data.name} — VERITY`,
      description,
      images:      data.image_url ? [{ url: data.image_url, alt: data.name }] : undefined,
    },
    twitter: {
      title:       `${data.name} — VERITY`,
      description,
      images:      data.image_url ? [data.image_url] : undefined,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ActressPage({
  params,
  searchParams,
}: {
  params:       Promise<Params>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id }       = await params
  const { lang: lp } = await searchParams
  const lang         = getLang(lp)
  const t            = I18N[lang]

  const supabase = await createClient()

  const { data: actressData } = await supabase
    .from('actresses')
    .select('*')
    .eq('external_id', id)
    .eq('is_active', true)
    .single()

  if (!actressData) notFound()

  const actress = actressData as Actress
  const now = new Date().toISOString()

  const aliases = (actress.metadata?.aliases ?? []) as string[]
  const searchNames = [actress.name, ...aliases]

  const isOverseas = await getIsOverseasUser()

  const [{ data: upcomingData }, { data: recentData }, { data: lpRankRows }, { data: tagRows }, { data: saleData }] = await Promise.all([
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .or(`published_at.gt.${now},published_at.is.null`)
      .order('published_at', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .limit(12),
    supabase.rpc('get_actress_lp_ranking', {
      p_actress_id: actress.id,
      p_brand_id:   BRAND_ID,
      p_limit:      10,
    }),
    supabase
      .from('articles')
      .select('tags')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .limit(300),
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .filter('metadata->>is_on_sale', 'eq', 'true')
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .limit(10),
  ])

  function soloFirst(rows: Article[]): Article[] {
    const isSolo = (a: Article) => {
      const meta = a.metadata as Record<string, unknown> | null
      return Array.isArray(meta?.actress) && (meta!.actress as unknown[]).length === 1
    }
    return [
      ...rows.filter(isSolo),
      ...rows.filter(a => !isSolo(a)),
    ].slice(0, 6)
  }

  const upcoming     = soloFirst(deduplicateDigitalFirst((upcomingData as Article[]) ?? []))
  const recent       = soloFirst(deduplicateDigitalFirst((recentData   as Article[]) ?? []))
  const saleArticles = deduplicateDigitalFirst((saleData as Article[]) ?? []).slice(0, 8)
  const total        = upcoming.length + recent.length

  type LpRankRow = { rank: number; display_name: string; lp_points: number }
  const lpRanking = (lpRankRows ?? []) as LpRankRow[]

  const actressNameSet = new Set(searchNames)
  const tagCounts = new Map<string, number>()
  for (const row of tagRows ?? []) {
    for (const t2 of (row.tags as string[]) ?? []) {
      if (t2 && !actressNameSet.has(t2)) {
        tagCounts.set(t2, (tagCounts.get(t2) ?? 0) + 1)
      }
    }
  }
  const topGenres = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }))

  const coStarFreq = new Map<string, number>()
  for (const art of [...((upcomingData as Article[]) ?? []), ...((recentData as Article[]) ?? [])]) {
    const meta = art.metadata?.actress
    if (Array.isArray(meta)) {
      for (const a of meta as { id: number; name: string }[]) {
        if (a.id > 0) {
          const extId = `dmm-actress-${a.id}`
          if (extId !== actress.external_id) {
            coStarFreq.set(extId, (coStarFreq.get(extId) ?? 0) + 1)
          }
        }
      }
    }
  }
  const coStarExtIds = [...coStarFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)

  type MakerEntry = { id: number; name: string }
  let makerEntry: MakerEntry | null = null
  for (const art of (recentData as Article[]) ?? []) {
    const raw = art.metadata?.maker
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as MakerEntry[]
        if (parsed[0]?.id) { makerEntry = parsed[0]; break }
      } catch { /* ignore */ }
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <LogView targetType="actress" targetId={actress.external_id} />

      {/* Back navigation + Language Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            <ArrowLeft size={14} />
            {t.backHome}
          </Link>
          <span className="text-[var(--border)]" aria-hidden>|</span>
          <Link
            href="/verity/profile"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            <UserCircle size={14} />
            {t.backProfile}
          </Link>
        </div>
        <LangSwitch lang={lang} />
      </div>

      {/* Actress header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-[var(--text)]">{actress.name}</h1>
            <FavoriteButton type="actress" id={actress.external_id} size="md" />
          </div>
          {actress.ruby && (
            <p className="text-sm text-[var(--text-muted)]">{actress.ruby}</p>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            {t.works(total)}
          </p>
        </div>
        <ShareButton url={`/verity/actresses/${actress.external_id}`} title={actress.name} />
      </div>

      {/* ランキング熱量ヒント */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--magenta)]/20 bg-[var(--magenta)]/5 px-3 py-2 text-[11px] text-[var(--text-muted)]">
        <Heart size={11} className="shrink-0 text-[var(--magenta)]" />
        <span className="flex-1">{t.rankBoostNote}</span>
        <Link
          href={`/verity/ranking${lang !== 'ja' ? `?lang=${lang}` : ''}`}
          className="shrink-0 font-bold text-[var(--magenta)] hover:underline"
        >
          {t.rankBoostLink} →
        </Link>
      </div>

      {total === 0 && (
        <p className="text-[var(--text-muted)]">作品が見つかりませんでした</p>
      )}

      {/* Pre-orders */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Bookmark size={16} className="text-sky-400" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.preOrder}</h2>
            <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
              {t.preOrderBadge}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {upcoming.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Recent releases */}
      {recent.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.recent}</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              {t.recentBadge}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {recent.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          <div className="pt-2 flex items-center gap-2.5 flex-wrap">
            <PurchaseLink
              href={withAffiliate(`https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(actress.name)}/`) ?? '#'}
              targetId={actress.external_id}
              actionType="purchase_click"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
            >
              <ShoppingCart size={13} />
              {t.fanzaSearch(actress.name)}
            </PurchaseLink>
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
              PR
            </span>
          </div>
        </section>
      )}

      {/* セール中の作品 */}
      <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Flame size={16} className="text-red-400" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.saleSection}</h2>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
              {t.saleBadge}
            </span>
          </div>
          {saleArticles.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {saleArticles.map((art) => {
                const meta = (art.metadata ?? {}) as Record<string, unknown>
                const rawUrl = (meta.affiliate_url ?? meta.url) as string | null
                const saleUrl = withAffiliateForRegion(rawUrl, isOverseas)
                const salePrice = typeof meta.sale_price === 'number' ? (meta.sale_price as number) : null
                const proxyImg = art.image_url
                  ? `/api/proxy/image?url=${encodeURIComponent(art.image_url)}`
                  : null
                return saleUrl ? (
                  <FanzaLink
                    key={art.id}
                    href={saleUrl}
                    targetId={art.external_id}
                    position="actress_sale_card"
                    className="group/sc relative shrink-0 w-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:border-red-400/50 transition-colors"
                  >
                    <div className="relative aspect-[2/3]">
                      {proxyImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg} alt={art.title} className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-200 group-hover/sc:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-[var(--surface-2)]" />
                      )}
                      <span className="absolute bottom-1 left-0 rounded-r-full bg-red-500/95 px-1.5 py-0.5 text-[8px] font-black text-white">
                        {salePrice !== null ? `¥${salePrice}` : 'SALE'}
                      </span>
                    </div>
                    <p className="p-1.5 text-[9px] leading-tight text-[var(--text)] line-clamp-2">
                      {art.title}
                    </p>
                  </FanzaLink>
                ) : null
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{t.noSale}</p>
          )}
          <FanzaLink
            href={withAffiliateForRegion(
              `https://www.dmm.co.jp/digital/videoa/-/sale/=/searchstr=${encodeURIComponent(actress.name)}/`,
              isOverseas,
            ) ?? '#'}
            targetId={actress.external_id}
            position="actress_sale_search"
            className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Flame size={13} />
            {t.fanzaSaleLink(actress.name)}
            <ExternalLink size={12} />
          </FanzaLink>
      </section>

      {/* ジャンル別カタログ */}
      {topGenres.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Tag size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.genreCatalog}</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              {t.genreBadge(actress.name)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topGenres.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/verity/actresses/${actress.external_id}/genres/${encodeURIComponent(tag)}`}
                className="group flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm transition-all hover:border-[var(--magenta)]/50 hover:bg-[var(--magenta)]/8 hover:text-[var(--magenta)]"
              >
                <Tag size={11} className="text-[var(--text-muted)] group-hover:text-[var(--magenta)]" />
                <span className="font-medium text-[var(--text)] group-hover:text-[var(--magenta)]">{tag}</span>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 自動レコメンド */}
      <ActressDiscoveryBlock
        actress={actress}
        recentArticles={(recentData as Article[]) ?? []}
        makerEntry={makerEntry}
        coStarExtIds={coStarExtIds}
      />

      {/* 大型 FANZA 誘導 CTA */}
      {(() => {
        const ctaUrl = withAffiliateForRegion(
          `https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(actress.name)}/`,
          isOverseas,
        )
        return ctaUrl ? (
          <FanzaLink
            href={ctaUrl}
            targetId={actress.external_id}
            position="actress_large_cta"
            className="block"
          >
            <div
              className="relative overflow-hidden rounded-2xl px-6 py-8 text-center hover:brightness-110 active:scale-[0.99] transition-all"
              style={{
                background: 'linear-gradient(135deg, #120006 0%, #1a000d 50%, #080010 100%)',
                border: '1px solid rgba(226,0,116,0.30)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(226,0,116,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.8) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
              <div className="relative z-10 space-y-4">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--magenta)]">FANZA 公式</p>
                <h2 className="text-xl font-black text-white">
                  {t.ctaTitle(actress.name)}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {t.ctaSub}
                </p>
                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--magenta)] px-8 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.5)]">
                  <ExternalLink size={14} />
                  {t.ctaBtn}
                </div>
                <p className="text-[10px] text-[var(--text-muted)] tracking-widest">
                  {t.prText}
                </p>
              </div>
            </div>
          </FanzaLink>
        ) : null
      })()}

      {/* 宣伝担当ランキング */}
      {lpRanking.length > 0 && (
        <section className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl px-6 py-5"
            style={{
              background: 'linear-gradient(135deg, #0a0a0f 0%, #150a20 50%, #0a0f1a 100%)',
              border: '1px solid rgba(226,0,116,0.25)',
            }}>
            <div className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'linear-gradient(rgba(226,0,116,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.6) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }} />
            <div className="relative z-10 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/verity/king.png" alt="" width={22} height={22} style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.7))' }} />
              <div>
                <p className="text-xs font-black tracking-[0.2em] uppercase" style={{ color: '#E20074' }}>
                  宣伝担当ランキング
                </p>
                <p className="text-[10px]" style={{ color: 'rgba(240,240,248,0.5)' }}>
                  {actress.name}に最も LP を捧げた推し人
                </p>
              </div>
            </div>
          </div>

          <ol className="space-y-2">
            {lpRanking.map((row, i) => {
              const isTop3  = i < 3
              const rankColors = ['#fbbf24', '#94a3b8', '#b45309']
              const glowColors = ['rgba(251,191,36,0.3)', 'rgba(148,163,184,0.2)', 'rgba(180,83,9,0.2)']
              return (
                <li key={i} className="relative overflow-hidden rounded-xl px-4 py-3 flex items-center gap-4"
                  style={{
                    background:  isTop3
                      ? `linear-gradient(90deg, rgba(0,0,0,0.6), ${glowColors[i]}20, rgba(0,0,0,0.6))`
                      : 'rgba(18,18,26,0.8)',
                    border: isTop3
                      ? `1px solid ${rankColors[i]}30`
                      : '1px solid rgba(42,42,58,0.6)',
                    boxShadow: isTop3 ? `0 0 20px ${glowColors[i]}` : 'none',
                  }}>
                  <span className="w-8 shrink-0 text-center text-sm font-black font-mono"
                    style={{ color: isTop3 ? rankColors[i] : 'rgba(136,136,170,0.6)',
                             textShadow: isTop3 ? `0 0 8px ${rankColors[i]}` : 'none' }}>
                    {i < 9 ? `0${i + 1}` : `${i + 1}`}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-bold text-sm"
                    style={{
                      color:       isTop3 ? '#f0f0f8' : 'rgba(240,240,248,0.7)',
                      textShadow:  isTop3 ? `0 0 12px ${rankColors[i]}40` : 'none',
                      letterSpacing: '0.03em',
                    }}>
                    {row.display_name}
                  </span>
                  <span className="shrink-0 font-black text-sm font-mono"
                    style={{
                      color:      isTop3 ? rankColors[i] : '#8888aa',
                      textShadow: isTop3 ? `0 0 10px ${rankColors[i]}` : 'none',
                    }}>
                    💙 {row.lp_points} LP
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
