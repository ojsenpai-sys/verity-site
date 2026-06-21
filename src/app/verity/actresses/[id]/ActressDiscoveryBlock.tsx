import Link from 'next/link'
import { Building2, ChevronRight, ExternalLink, Sparkles, Tag, TrendingUp, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { coverPosClass } from '@/lib/cidUtils'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'
import { getMakerById } from '@/lib/makers'
import { TrackedLink } from './TrackedLink'
import type { Article, Actress } from '@/lib/types'

type MakerEntry = { id: number; name: string }
type SlimActress = { external_id: string; name: string; image_url: string | null }

type Props = {
  actress:        Actress
  recentArticles: Article[]
  makerEntry:     MakerEntry | null
  coStarExtIds:   string[]    // frequency-sorted descending
  topGenres:      { tag: string; count: number }[]
}

function proxyUrl(src: string) {
  return `/api/proxy/image?url=${encodeURIComponent(src)}`
}

function isDigitalWork(article: Article): boolean {
  const url = (article.metadata?.url as string) ?? ''
  return url.includes('video.dmm.co.jp') || url.includes('/digital/')
}

function getAffiliateUrl(article: Article): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string'
      ? (article.metadata.url as string)
      : null
  return withAffiliate(raw)
}

function digitalFirst(articles: Article[]): Article[] {
  const deduped = deduplicateDigitalFirst(articles)
  return [
    ...deduped.filter(isDigitalWork),
    ...deduped.filter(a => !isDigitalWork(a)),
  ]
}

function RecoWorkCard({ article, position }: { article: Article; position: string }) {
  const url    = getAffiliateUrl(article)
  const imgUrl = article.image_url

  const inner = (
    <>
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
        {imgUrl ? (
          <ProxiedImage
            src={proxyUrl(imgUrl)}
            alt={article.title}
            className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(imgUrl)} transition-transform duration-300 group-hover:scale-105`}
          />
        ) : (
          <NowPrinting />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
      </div>
      <div className="p-3 space-y-2">
        <p className="text-[11px] leading-snug line-clamp-2 text-[var(--text)] min-h-[2.75rem]">
          {article.title}
        </p>
        <div className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--magenta)]/15 px-2 py-1.5 text-[11px] font-bold text-[var(--magenta)] group-hover:bg-[var(--magenta)]/30 transition-colors">
          <ExternalLink size={9} />
          FANZAで今すぐ見る
        </div>
      </div>
    </>
  )

  const cls =
    'block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden group ' +
    'hover:border-[var(--magenta)]/70 hover:shadow-[0_0_24px_rgba(226,0,116,0.18)] hover:-translate-y-1 transition-all duration-200'

  return url ? (
    <FanzaLink href={url} targetId={article.external_id} position={position} className={cls}>
      {inner}
    </FanzaLink>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

function RecoHeader({
  icon, title, subtitle, color, href,
}: {
  icon: React.ReactNode; title: string; subtitle: string; color: string; href?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <h2 className="text-sm font-black tracking-tight" style={{ color }}>
            {title}
          </h2>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-widest"
            style={{ background: color + '18', color, border: `1px solid ${color}35` }}
          >
            PR
          </span>
          {href && (
            <Link
              href={href}
              className="ml-auto flex items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-white transition-colors"
            >
              もっと見る <ChevronRight size={10} />
            </Link>
          )}
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  )
}

export async function ActressDiscoveryBlock({
  actress, recentArticles, makerEntry, coStarExtIds, topGenres,
}: Props) {
  const supabase = await createClient()
  const now      = new Date().toISOString()

  const articleExtIds  = recentArticles.map(a => a.external_id).filter(Boolean)
  const topGenreNames  = topGenres.slice(0, 3).map(g => g.tag)

  // 4 parallel queries: same-maker (③), related actresses (④), click counts (⑤), same-genre articles (⑥)
  const [makerResult, coStarResult, clickResult, sameGenreResult] = await Promise.all([
    makerEntry
      ? supabase
          .from('articles')
          .select('id, external_id, title, image_url, metadata, published_at, slug, source, category, tags, summary, content, fetched_at, is_active')
          .eq('is_active', true)
          .lte('published_at', now)
          .filter('tags', 'not.cs', `{"${actress.name}"}`)
          .filter('metadata->>maker', 'like', `%"id": ${makerEntry.id}%`)
          .order('published_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] as Article[] }),

    coStarExtIds.length > 0
      ? supabase
          .from('actresses')
          .select('external_id, name, image_url')
          .in('external_id', coStarExtIds.slice(0, 16))
          .eq('is_active', true)
          .neq('external_id', actress.external_id)
          .limit(6)
      : Promise.resolve({ data: [] as SlimActress[] }),

    articleExtIds.length > 0
      ? supabase
          .from('user_events')
          .select('target_id')
          .eq('event_name', 'fanza_click')
          .in('target_id', articleExtIds)
          .limit(2000)
      : Promise.resolve({ data: [] as { target_id: string | null }[] }),

    // ⑥ 同ジャンル記事 — 後でactrессIDを抽出して二次クエリ
    topGenreNames.length > 0
      ? supabase
          .from('articles')
          .select('metadata')
          .eq('is_active', true)
          .overlaps('tags', topGenreNames)
          .filter('tags', 'not.cs', `{"${actress.name}"}`)
          .order('published_at', { ascending: false })
          .limit(80)
      : Promise.resolve({ data: [] as { metadata: Record<string, unknown> | null }[] }),
  ])

  // Build click-count map for popular works ranking
  const clickMap = new Map<string, number>()
  for (const row of ((clickResult.data ?? []) as { target_id: string | null }[])) {
    if (row.target_id) {
      clickMap.set(row.target_id, (clickMap.get(row.target_id) ?? 0) + 1)
    }
  }

  // ③ Same maker — digital-first top 4
  const sectionC = digitalFirst((makerResult.data as Article[] | null) ?? []).slice(0, 4)

  // ④ Related actresses — frequency-sorted co-stars
  // image_url が null の女優に対して最新作品の画像を一括フォールバック
  let sectionD = (coStarResult.data as SlimActress[] | null) ?? []
  const nullImageNames = sectionD.filter(a => !a.image_url).map(a => a.name)
  if (nullImageNames.length > 0) {
    const { data: fallbackArts } = await supabase
      .from('articles')
      .select('tags, image_url')
      .overlaps('tags', nullImageNames)
      .eq('is_active', true)
      .not('image_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(nullImageNames.length * 4)

    const fallbackMap = new Map<string, string>()
    for (const art of (fallbackArts ?? []) as { tags: string[] | null; image_url: string | null }[]) {
      for (const tag of art.tags ?? []) {
        if (nullImageNames.includes(tag) && !fallbackMap.has(tag) && art.image_url) {
          fallbackMap.set(tag, art.image_url)
        }
      }
    }
    sectionD = sectionD.map(a => ({
      ...a,
      image_url: a.image_url ?? fallbackMap.get(a.name) ?? null,
    }))
  }

  // ⑤ Popular works — sort recentArticles by fanza_click count descending
  const sectionE = digitalFirst([...recentArticles])
    .sort((a, b) => (clickMap.get(b.external_id) ?? 0) - (clickMap.get(a.external_id) ?? 0))
    .slice(0, 4)

  // ⑥ 同ジャンル女優 — coStarと重複しない女優を周波数順で取得
  const coStarSet = new Set(coStarExtIds)
  const sameGenreFreq = new Map<string, number>()
  for (const row of (sameGenreResult.data ?? []) as { metadata: Record<string, unknown> | null }[]) {
    const meta = row.metadata?.actress
    if (Array.isArray(meta)) {
      for (const a of meta as { id: number; name: string }[]) {
        if (a.id > 0) {
          const extId = `dmm-actress-${a.id}`
          if (extId !== actress.external_id && !coStarSet.has(extId)) {
            sameGenreFreq.set(extId, (sameGenreFreq.get(extId) ?? 0) + 1)
          }
        }
      }
    }
  }
  const sameGenreExtIds = [...sameGenreFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id)

  let sectionF: SlimActress[] = []
  if (sameGenreExtIds.length > 0) {
    const { data: sgRaw } = await supabase
      .from('actresses')
      .select('external_id, name, image_url')
      .in('external_id', sameGenreExtIds)
      .eq('is_active', true)
      .limit(6)
    sectionF = (sgRaw as SlimActress[] | null) ?? []

    // image fallback
    const nullNamesF = sectionF.filter(a => !a.image_url).map(a => a.name)
    if (nullNamesF.length > 0) {
      const { data: fbArts } = await supabase
        .from('articles')
        .select('tags, image_url')
        .overlaps('tags', nullNamesF)
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .order('published_at', { ascending: false })
        .limit(nullNamesF.length * 4)
      const fbMap = new Map<string, string>()
      for (const art of (fbArts ?? []) as { tags: string[] | null; image_url: string | null }[]) {
        for (const tag of art.tags ?? []) {
          if (nullNamesF.includes(tag) && !fbMap.has(tag) && art.image_url) {
            fbMap.set(tag, art.image_url)
          }
        }
      }
      sectionF = sectionF.map(a => ({
        ...a,
        image_url: a.image_url ?? fbMap.get(a.name) ?? null,
      }))
    }
  }

  if (sectionC.length === 0 && sectionD.length === 0 && sectionE.length === 0 && sectionF.length === 0) return null

  const makerHasPage = makerEntry ? getMakerById(makerEntry.id) !== undefined : false

  return (
    <div className="space-y-10">

      {/* セパレータ */}
      <div className="relative flex items-center gap-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
        <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          自動レコメンド
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      </div>

      {/* ③ 同メーカー最新ラインナップ */}
      {sectionC.length > 0 && makerEntry && (
        <section className="space-y-4">
          <RecoHeader
            icon={<Building2 size={14} color="#22ccff" />}
            title={`${makerEntry.name}の最新ラインナップ`}
            subtitle={`${actress.name}と同メーカーのおすすめ作品`}
            color="#22ccff"
            href={makerHasPage ? `/verity/makers/${makerEntry.id}` : undefined}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionC.map(a => (
              <RecoWorkCard key={a.id} article={a} position="actress_maker_video" />
            ))}
          </div>
        </section>
      )}

      {/* ④ 関連女優（共演・類似） */}
      {sectionD.length > 0 && (
        <section className="space-y-4">
          <RecoHeader
            icon={<Sparkles size={14} color="#fbbf24" />}
            title="こちらの女優もオススメ"
            subtitle="共演・同ジャンルの女優をチェック"
            color="#fbbf24"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionD.map(a => (
              <TrackedLink
                key={a.external_id}
                href={`/verity/actresses/${a.external_id}`}
                eventName="actress_view"
                payload={{ actressId: a.external_id, position: 'actress_related_actress' }}
                className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden group hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:-translate-y-1 transition-all duration-200"
              >
                <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                  {a.image_url ? (
                    <ProxiedImage
                      src={proxyUrl(a.image_url)}
                      alt={a.name}
                      className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(a.image_url)} transition-transform duration-300 group-hover:scale-105`}
                    />
                  ) : (
                    <NowPrinting />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <p className="text-xs font-bold text-white drop-shadow-lg line-clamp-1">{a.name}</p>
                    <p className="flex items-center gap-0.5 text-[10px] text-amber-300/80">
                      プロフィールを見る <ExternalLink size={8} />
                    </p>
                  </div>
                </div>
              </TrackedLink>
            ))}
          </div>
        </section>
      )}

      {/* ⑥ 同ジャンル女優 */}
      {sectionF.length > 0 && topGenres.length > 0 && (
        <section className="space-y-4">
          <RecoHeader
            icon={<Users size={14} color="#4ade80" />}
            title="同ジャンルの人気女優"
            subtitle={`${topGenres.slice(0, 2).map(g => g.tag).join('・')} などのジャンルで活躍する女優`}
            color="#4ade80"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionF.map(a => (
              <TrackedLink
                key={a.external_id}
                href={`/verity/actresses/${a.external_id}`}
                eventName="actress_view"
                payload={{ actressId: a.external_id, position: 'actress_same_genre' }}
                className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden group hover:border-green-500/60 hover:shadow-[0_0_20px_rgba(74,222,128,0.15)] hover:-translate-y-1 transition-all duration-200"
              >
                <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                  {a.image_url ? (
                    <ProxiedImage
                      src={proxyUrl(a.image_url)}
                      alt={a.name}
                      className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(a.image_url)} transition-transform duration-300 group-hover:scale-105`}
                    />
                  ) : (
                    <NowPrinting />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <p className="text-xs font-bold text-white drop-shadow-lg line-clamp-1">{a.name}</p>
                    <p className="flex items-center gap-0.5 text-[10px] text-green-300/80">
                      プロフィールを見る <ExternalLink size={8} />
                    </p>
                  </div>
                </div>
              </TrackedLink>
            ))}
          </div>
          {topGenres[0] && (
            <Link
              href={`/verity/genres/${encodeURIComponent(topGenres[0].tag)}`}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-green-400 transition-colors"
            >
              <Tag size={11} />
              {topGenres[0].tag}の全作品を見る →
            </Link>
          )}
        </section>
      )}

      {/* ⑤ 人気作品（fanza_click 多い順） */}
      {sectionE.length > 0 && (
        <section className="space-y-4">
          <RecoHeader
            icon={<TrendingUp size={14} color="#a78bfa" />}
            title={`${actress.name}の人気作品`}
            subtitle="VERITYユーザーに最も選ばれた作品"
            color="#a78bfa"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionE.map(a => (
              <RecoWorkCard key={a.id} article={a} position="actress_popular_video" />
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
