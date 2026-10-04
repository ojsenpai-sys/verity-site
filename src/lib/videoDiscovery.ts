import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { coverPosClass, isBadImageUrl, cidToCdnUrl, toHighResPackageUrl } from '@/lib/cidUtils'
import { getFastestReleasesSections, getFastestCandidateVideoInfo } from '@/lib/fastestReleases'
import { getTopRankedWorks } from '@/lib/worksRanking'
import { selectNewReleases, selectPopular } from '@/lib/videoDiscoverySelection.mjs'

// VIDEO DISCOVERY（/verity/videos）— サーバー側の取得＋整形。
//
// 既存キャッシュのみを読む（新RPC・DB変更・追加scanなし）:
//   NEW RELEASES      … getFastestReleasesSections()（＋同一チャンクキャッシュの候補行で動画/発売日を補完）
//   POPULAR ON VERITY … getTopRankedWorks()（works_ranking_cache・キャッシュ深度20）
// 選定ロジックは videoDiscoverySelection.mjs（pure・node:test 対象）。
// 6本に満たない棚は補充せず、取得できた件数だけ返す。

export type VideoRow = 'new' | 'popular'

export type VideoDiscoveryItem = {
  cid:            string
  row:            VideoRow
  /** 棚内の1始まり位置（計測 metadata.slot 用） */
  position:       number
  title:          string
  slug:           string | null
  actress:        string | null
  releaseDate:    string | null   // 'YYYY.MM.DD'（JST・サーバー整形済み）
  imgSrc:         string
  coverPos:       string
  fanzaUrl:       string | null   // リージョン解決済みアフィリエイトURL（FanzaLink に渡す）
  /** FANZA公式 litevideo プレイヤーURL（iframe 用・初期HTMLには出さない）。 */
  sampleMovieUrl: string
}

export type VideoDiscoveryShelves = {
  newReleases: VideoDiscoveryItem[]
  popular:     VideoDiscoveryItem[]
}

// works_ranking_cache の深度（054 p_depth 既定値）。全件読んでも20行。
const POPULAR_POOL = 20

function formatReleaseDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/-/g, '.')
}

function coverOf(cid: string, imageUrl: string | null | undefined): string {
  const raw = imageUrl && !isBadImageUrl(imageUrl) ? imageUrl : null
  return toHighResPackageUrl(raw) ?? raw ?? cidToCdnUrl(cid, 'pl')
}

function proxied(url: string): string {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

function firstActressName(meta: Record<string, unknown> | null | undefined): string | null {
  if (Array.isArray(meta?.actress)) {
    const a = (meta!.actress as Array<{ name?: string }>).find(x => x?.name)
    if (a?.name) return a.name
  }
  return null
}

async function buildNewReleases(nowMs: number, isOverseas: boolean): Promise<VideoDiscoveryItem[]> {
  const [sections, info] = await Promise.all([getFastestReleasesSections(), getFastestCandidateVideoInfo()])

  // 自動取得セクション（手動フォールバックは動画情報を持たないため対象外）のカードを
  // 候補行の動画/発売日情報と突き合わせる。
  const cards = sections
    .filter(s => s.source === 'auto')
    .flatMap(s => s.cards)
  const byCid = new Map(cards.map(card => [card.cid, card]))

  const candidates = cards.flatMap(card => {
    const v = info.get(card.cid)
    if (!v) return []
    return [{
      cid:            card.cid,
      makerId:        v.makerId,
      floor:          v.floor,
      sampleMovieUrl: v.sampleMovieUrl,
      publishedAt:    v.publishedAt,
      fetchedAt:      v.fetchedAt,
    }]
  })

  const selected = selectNewReleases(candidates, { nowMs })
  return selected.map((c, i) => {
    const card = byCid.get(c.cid)!
    return {
      cid:            c.cid,
      row:            'new' as const,
      position:       i + 1,
      title:          card.title,
      slug:           card.slug,
      actress:        card.actressName || null,
      releaseDate:    formatReleaseDate(c.publishedAt),
      imgSrc:         card.imgSrc,
      coverPos:       coverPosClass(card.coverUrl),
      fanzaUrl:       withAffiliateForRegion(info.get(c.cid)?.rawFanzaUrl, isOverseas),
      sampleMovieUrl: c.sampleMovieUrl as string,
    }
  })
}

async function buildPopular(nowMs: number, isOverseas: boolean, excludeCids: string[]): Promise<VideoDiscoveryItem[]> {
  const ranked = await getTopRankedWorks(POPULAR_POOL)
  const byCid = new Map(ranked.map(r => [r.article.external_id, r.article]))

  const candidates = ranked.map(r => {
    const meta = (r.article.metadata ?? {}) as Record<string, unknown>
    return {
      cid:            r.article.external_id,
      rank:           r.rank,
      floor:          typeof meta.floor === 'string' ? meta.floor : null,
      sampleMovieUrl: typeof meta.sample_movie_url === 'string' && meta.sample_movie_url ? meta.sample_movie_url : null,
      publishedAt:    r.article.published_at ?? null,
    }
  })

  const selected = selectPopular(candidates, { nowMs, excludeCids })
  return selected.map((c, i) => {
    const a = byCid.get(c.cid)!
    const meta = (a.metadata ?? {}) as Record<string, unknown>
    const rawUrl =
      typeof meta.affiliate_url === 'string' ? meta.affiliate_url
      : typeof meta.url === 'string' && a.source === 'dmm' ? meta.url
      : null
    const cover = coverOf(a.external_id, a.image_url)
    return {
      cid:            c.cid,
      row:            'popular' as const,
      position:       i + 1,
      title:          a.title,
      slug:           a.slug ?? null,
      actress:        firstActressName(meta),
      releaseDate:    formatReleaseDate(a.published_at),
      imgSrc:         proxied(cover),
      coverPos:       coverPosClass(cover),
      fanzaUrl:       withAffiliateForRegion(rawUrl, isOverseas),
      sampleMovieUrl: c.sampleMovieUrl as string,
    }
  })
}

export async function getVideoDiscoveryShelves(): Promise<VideoDiscoveryShelves> {
  const nowMs = Date.now()
  const isOverseas = await getIsOverseasUser()

  // 片方の棚の失敗でページ全体を落とさない（空棚として扱う）。
  const newReleases = await buildNewReleases(nowMs, isOverseas).catch((err) => {
    console.error('[VideoDiscovery] new releases failed:', err instanceof Error ? err.message : err)
    return [] as VideoDiscoveryItem[]
  })
  const popular = await buildPopular(nowMs, isOverseas, newReleases.map(i => i.cid)).catch((err) => {
    console.error('[VideoDiscovery] popular failed:', err instanceof Error ? err.message : err)
    return [] as VideoDiscoveryItem[]
  })

  return { newReleases, popular }
}
