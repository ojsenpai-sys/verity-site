// 逢沢みゆ特集専用の作品カード。satsuki-nao の WorkCard を踏襲しつつ、
// v2で新たに必要な VR バッジ / Editor's Pick 強調表示 / 予約バッジに対応する。
// dark・editorial なトーンに合わせ配色は独自（satsuki-naoのゴールドは流用しない）。
import { ExternalLink, ChevronRight, Crown } from 'lucide-react'
import { FanzaLink } from '@/components/FanzaLink'
import { SpotlightLink } from '@/components/SpotlightLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
// pure ロジックのみを直接importする（'@/lib/spotlightV2' 経由だと server-only な
// getArticlesByCids(next/headers依存)まで client bundle に混入してしまうため）。
import { isVrWork, getReservationStatus as getReservationStatusPure } from '@/lib/spotlightV2Selection.mjs'
import { AIZAWA_MIYU_META } from '@/lib/aizawaMiyu'

export type WorkCardArticle = {
  external_id: string
  title: string
  slug: string | null
  image_url: string | null
  published_at: string | null
  metadata: Record<string, unknown> | null
  tags?: string[] | null
}

type NamedRef = { id?: number; name?: string }

export function makerName(article: WorkCardArticle): string | null {
  const list = article.metadata?.maker
  if (Array.isArray(list)) return (list as NamedRef[])[0]?.name ?? null
  return null
}

export function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function proxiedJacket(article: WorkCardArticle): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  if (article.external_id) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
  return null
}

export function affiliateUrl(article: WorkCardArticle, isOverseas: boolean): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? (article.metadata.affiliate_url as string)
      : typeof article.metadata?.url === 'string'
      ? (article.metadata.url as string)
      : null
  return withAffiliateForRegion(raw, isOverseas)
}

export function WorkCard({
  article,
  isOverseas,
  position,
  sectionBadge,
  reason,
  index,
  editorPick,
}: {
  article: WorkCardArticle
  isOverseas: boolean
  /** fanza_click の position（既存Spotlight命名規則: spotlight_aizawa_miyu / spotlight_aizawa_miyu_image） */
  position: 'spotlight_aizawa_miyu' | 'spotlight_aizawa_miyu_image'
  /** カード右上に出す短いバッジ（カテゴリ名等）。省略可。 */
  sectionBadge?: string
  reason?: string
  index?: number
  /** Editor's Pick として一段強く見せる場合 true。 */
  editorPick?: boolean
}) {
  const imgSrc = proxiedJacket(article)
  const maker = makerName(article)
  const fanzaUrl = affiliateUrl(article, isOverseas)
  const isVr = isVrWork({ tags: article.tags ?? [] })
  const reservation = getReservationStatusPure(article.published_at, new Date().toISOString())

  const clickMeta: Record<string, unknown> = {
    source: 'spotlight',
    spotlight_slug: AIZAWA_MIYU_META.slug,
    ...(sectionBadge ? { spotlight_section: sectionBadge } : {}),
    ...(index !== undefined ? { spotlight_position: index } : {}),
    article_slug: article.slug,
    work_title: article.title,
    actress_name: AIZAWA_MIYU_META.actressName,
    ...(maker ? { maker_name: maker } : {}),
  }

  const cover = (
    <>
      {imgSrc ? (
        <ProxiedImage
          src={imgSrc}
          alt={`${article.title}（${AIZAWA_MIYU_META.actressName}）のパッケージ画像`}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(article.image_url)} transition-transform duration-300 group-hover:scale-105`}
        />
      ) : (
        <NowPrinting />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
    </>
  )

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-black/40 transition-all duration-200 hover:-translate-y-0.5 ${
        editorPick
          ? 'border-fuchsia-500/40 shadow-[0_0_28px_rgba(217,70,239,0.15)] hover:border-fuchsia-400/70'
          : 'border-white/10 hover:border-fuchsia-500/40'
      }`}
    >
      <div className={`relative w-full overflow-hidden bg-[#0a0a0d] ${editorPick ? 'aspect-[3/4]' : 'aspect-[2/3]'}`}>
        {fanzaUrl ? (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position={position}
            meta={clickMeta}
            ariaLabel={`${article.title}をFANZAで観る`}
            className="absolute inset-0 block h-full w-full"
          >
            {cover}
          </FanzaLink>
        ) : (
          cover
        )}

        {editorPick && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-0.5 text-[9px] font-black text-white shadow-lg">
            <Crown size={10} />
            EDITOR&apos;S PICK
          </span>
        )}
        {isVr && (
          <span className="absolute right-2 top-2 rounded-full border border-violet-400/60 bg-violet-600/85 px-2 py-0.5 text-[9px] font-black text-white backdrop-blur-sm">
            VR
          </span>
        )}
        {reservation.isFuture && (
          <span className="absolute bottom-2 left-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[9px] font-black text-black backdrop-blur-sm">
            {reservation.badge}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {article.slug ? (
          <SpotlightLink
            href={`/verity/articles/${article.slug}`}
            slug={AIZAWA_MIYU_META.slug}
            placement="page_work_detail"
            destination={article.external_id}
          >
            <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85 transition-colors group-hover:text-fuchsia-300">
              {article.title}
            </p>
          </SpotlightLink>
        ) : (
          <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/85">{article.title}</p>
        )}

        <div className="space-y-0.5">
          {maker && <p className="line-clamp-1 text-[9px] text-white/40">{maker}</p>}
          {article.published_at && <p className="text-[9px] text-fuchsia-300/50">{fmtDate(article.published_at)}</p>}
        </div>

        {reason && (
          <p className="mt-1 border-t border-white/10 pt-2 text-[10.5px] leading-relaxed text-white/55">{reason}</p>
        )}

        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          {fanzaUrl && (
            <FanzaLink
              href={fanzaUrl}
              targetId={article.external_id}
              position="spotlight_aizawa_miyu"
              meta={clickMeta}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 py-2 text-[10px] font-bold text-white transition-all hover:brightness-110"
            >
              {reservation.ctaLabel}
              <ExternalLink size={9} />
            </FanzaLink>
          )}
          {article.slug && (
            <SpotlightLink
              href={`/verity/articles/${article.slug}`}
              slug={AIZAWA_MIYU_META.slug}
              placement="page_work_detail"
              destination={article.external_id}
              className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-white/15 py-1.5 text-[10px] font-bold text-white/60 transition-colors hover:border-fuchsia-400/50 hover:text-fuchsia-300"
            >
              作品詳細へ
              <ChevronRight size={10} />
            </SpotlightLink>
          )}
        </div>
      </div>
    </article>
  )
}
