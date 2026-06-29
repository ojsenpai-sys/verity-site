import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { coverPosClass, isBadImageUrl, cidToCdnUrl, toHighResPackageUrl } from '@/lib/cidUtils'
import { getTopRankedWorks } from '@/lib/worksRanking'
import type { Article } from '@/lib/types'
import { HeroSection } from './HeroSection'
import { HeroV21Client } from './HeroV21Client'
import type { HeroV21Item } from '@/lib/heroV21'

// ── Hero v2.1 — 急上昇TOP10 大型Hero（サーバー：取得＋整形） ────────────────
//
// データ源は v2 rail と同じ `get_top_works_ranked` RPC（worksRanking.ts）。
// 直列化可能な HeroV21Item[] に整形してクライアントへ渡す。ランキングが空（RPC未適用/
// 未集計）の場合は従来 Hero（HeroSection）へグレースフルにフォールバックし、Hero空白を防ぐ。
//
// 切替は page 側の HERO_VARIANT フラグで行う。本コンポーネントは削除せず差し替え可能。

function firstActress(meta: Record<string, unknown> | null): { name: string; id: number } | null {
  if (Array.isArray(meta?.actress)) {
    const a = (meta!.actress as Array<{ id?: number; name?: string }>).find(x => x?.name)
    if (a?.name) return { name: a.name, id: typeof a.id === 'number' ? a.id : 0 }
  }
  if (typeof meta?.actress_name === 'string') return { name: meta.actress_name as string, id: 0 }
  return null
}

function firstMaker(meta: Record<string, unknown> | null): string | null {
  if (Array.isArray(meta?.maker)) {
    const m = (meta!.maker as Array<{ name?: string }>).find(x => x?.name)
    if (m?.name) return m.name
  }
  if (typeof meta?.maker_name === 'string') return meta.maker_name as string
  return null
}

function formatReleaseDate(published_at: string | null | undefined): string | null {
  if (!published_at) return null
  const d = new Date(published_at)
  if (Number.isNaN(d.getTime())) return null
  // JST の YYYY-MM-DD → YYYY.MM.DD（ハイドレーション差異を避けるためサーバーで確定）
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '.')
}

function toItem(rank: number, points: number, article: Article, isOverseas: boolean): HeroV21Item {
  const meta = (article.metadata ?? {}) as Record<string, unknown>

  const rawUrl =
    typeof meta.affiliate_url === 'string' ? (meta.affiliate_url as string)
    : typeof meta.url === 'string' && article.source === 'dmm' ? (meta.url as string)
    : null
  const fanzaUrl = withAffiliateForRegion(rawUrl, isOverseas)

  const cover = !isBadImageUrl(article.image_url)
    ? (toHighResPackageUrl(article.image_url) ?? article.image_url)
    : cidToCdnUrl(article.external_id, 'pl')
  const imgSrc = cover ? `/api/proxy/image?url=${encodeURIComponent(cover)}` : null

  const actress = firstActress(meta)

  return {
    rank,
    points,
    cid:         article.external_id,
    title:       article.title,
    slug:        article.slug ?? null,
    actress:     actress?.name ?? null,
    actressId:   actress?.id ?? null,
    maker:       firstMaker(meta),
    releaseDate: formatReleaseDate(article.published_at),
    imgSrc,
    coverPos:    coverPosClass(cover),
    fanzaUrl,
  }
}

export async function HeroV21Section() {
  const [isOverseas, ranked] = await Promise.all([
    getIsOverseasUser(),
    getTopRankedWorks(10),
  ])

  // ランキング未取得時は従来Heroへフォールバック（Hero空白を作らない）
  if (ranked.length === 0) return <HeroSection />

  const items = ranked.map(r => toItem(r.rank, r.points, r.article, isOverseas))

  return <HeroV21Client items={items} />
}
