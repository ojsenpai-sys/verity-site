'use server'

/**
 * X（Twitter）投稿文の生成アクション（Phase 1）。
 *
 * - 既存の公開ランキング/新着/セールデータを読み取り、ja/en/zh/all の投稿文を生成して返す。
 * - X へは投稿しない・履歴も保存しない（管理画面でコピーして手動投稿する運用）。
 * - 本文 URL は VERITY サイト内 URL のみ（アフィリエイト生リンクは載せない）。
 * - 画像は候補 URL を返すだけ（自動添付なし）。safeMode で候補自体を省略可。
 */

import { createClient as createAnonClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getTopRankedWorks } from '@/lib/worksRanking'
import { cidToCdnUrl, isBadImageUrl, toHighResPackageUrl } from '@/lib/cidUtils'
import { SALE_CAMPAIGNS } from '@/lib/social/saleData'
import { generatePost } from '@/lib/social/postGenerator'
import type {
  GenerateInput,
  GenerateResult,
  ImageCandidate,
  PostData,
  PostItem,
} from '@/lib/social/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function requireAdmin() {
  const supabase = await createAnonClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!user || !adminEmail || user.email !== adminEmail) {
    throw new Error('unauthorized')
  }
  return user
}

// ── ヘルパー ──────────────────────────────────────────────────────────────

function proxy(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

function imgCand(label: string, rawUrl: string | null | undefined): ImageCandidate | null {
  if (!rawUrl || isBadImageUrl(rawUrl)) return null
  return { label, url: rawUrl, proxyUrl: proxy(rawUrl) }
}

function firstActressName(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null
  const arr = metadata.actress
  if (Array.isArray(arr) && arr.length > 0) {
    const f = arr[0] as Record<string, unknown>
    if (f && typeof f.name === 'string' && f.name.trim()) return f.name.trim()
  }
  const an = metadata.actress_name
  if (typeof an === 'string' && an.trim()) return an.trim()
  return null
}

function truncate(s: string, n: number): string {
  const chars = [...s]
  return chars.length <= n ? s : `${chars.slice(0, n).join('')}…`
}

/** 作品の主ラベル: 女優名優先、無ければタイトル短縮。 */
function workLabel(metadata: Record<string, unknown> | null, title: string): string {
  return firstActressName(metadata) ?? truncate(title, 14)
}

function trendMetric(now: unknown, prev: unknown): string | null {
  const n = Number(now)
  const p = Number(prev)
  if (p === 0 && n > 0) return 'NEW'
  if (p > 0) {
    const pct = Math.round(((n - p) / p) * 100)
    if (pct > 0) return `+${pct}%`
  }
  return null
}

/** 女優のパッケージ/ポートレート画像の生 URL を解決（プロキシ前）。 */
function actressRawImage(image_url: string | null, metadata: Record<string, unknown> | null): string | null {
  const cid = metadata?.latest_cid
  if (typeof cid === 'string' && cid) return cidToCdnUrl(cid, 'pl')
  const raw = isBadImageUrl(image_url) ? null : image_url
  return toHighResPackageUrl(raw)
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.')
  } catch {
    return null
  }
}

function todayJst(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10) // YYYY-MM-DD
}

// ── メインアクション ──────────────────────────────────────────────────────

export async function generateSocialPost(input: GenerateInput): Promise<GenerateResult> {
  try {
    await requireAdmin()

    const safeMode = input.safeMode ?? false
    let data: PostData
    let images: ImageCandidate[] = []
    let sourceNote = ''

    switch (input.postType) {
      // ── 人気作品ランキング ──────────────────────────────────────────
      case 'ranking': {
        const limit = input.count ?? 5
        const works = await getTopRankedWorks(limit)
        if (works.length === 0) {
          return { ok: false, error: '人気作品ランキングのデータが取得できませんでした（RPC未適用/集計データなし）。' }
        }
        const items: PostItem[] = works.map((w) => ({
          rank: w.rank,
          name: workLabel(w.article.metadata, w.article.title),
          title: w.article.title,
          cid: w.article.external_id,
        }))
        data = {
          postType: 'ranking',
          templateKey: 'ranking_works',
          items,
          url: `${BASE}/ranking`,
          periodLabel: input.periodLabel ?? 'overall',
        }
        if (!safeMode) {
          images = works
            .slice(0, 3)
            .map((w) => imgCand(`#${w.rank} ${w.article.external_id}`, cidToCdnUrl(w.article.external_id, 'pl')))
            .filter((x): x is ImageCandidate => x !== null)
        }
        sourceNote = '人気作品ランキング（get_top_works_ranked / 直近14日・半減期7日の総合スコア）'
        break
      }

      // ── 人気/急上昇 女優 ────────────────────────────────────────────
      case 'actress_trending': {
        const limit = input.count ?? 5
        const variant = input.variant ?? 'rising'

        if (variant === 'rising') {
          const db = svc()
          let rows = ((await db.rpc('get_trending_actresses', { p_limit: limit, p_hours: 24 })).data ?? []) as Array<Record<string, unknown>>
          if (rows.length === 0) {
            rows = ((await db.rpc('get_trending_actresses', { p_limit: limit, p_hours: 168 })).data ?? []) as Array<Record<string, unknown>>
          }
          if (rows.length > 0) {
            const items: PostItem[] = rows.map((r, i) => ({
              rank: i + 1,
              name: String(r.name ?? ''),
              metric: trendMetric(r.cnt_now, r.cnt_prev),
            }))
            data = {
              postType: 'actress_trending',
              templateKey: 'actress_rising',
              items,
              url: `${BASE}/ranking`,
            }
            if (!safeMode) {
              images = rows
                .slice(0, 3)
                .map((r, i) => imgCand(`#${i + 1} ${r.name ?? ''}`, actressRawImage((r.image_url as string) ?? null, (r.metadata as Record<string, unknown>) ?? null)))
                .filter((x): x is ImageCandidate => x !== null)
            }
            sourceNote = '急上昇女優（get_trending_actresses / 24h→168h フォールバック）'
            break
          }
          // trending が空 → 人気（favorite）にフォールバック
        }

        // popular（お気に入り数ランキング）
        const db = svc()
        const rows = ((await db.rpc('get_actress_favorite_ranking', { p_limit: limit })).data ?? []) as Array<Record<string, unknown>>
        if (rows.length === 0) {
          return { ok: false, error: '女優ランキングのデータが取得できませんでした。' }
        }
        const items: PostItem[] = rows.map((r, i) => ({
          rank: i + 1,
          name: String(r.name ?? ''),
          metric: `★${Number(r.favorite_count ?? 0).toLocaleString()}`,
        }))
        data = {
          postType: 'actress_trending',
          templateKey: 'actress_popular',
          items,
          url: `${BASE}/ranking`,
        }
        if (!safeMode) {
          images = rows
            .slice(0, 3)
            .map((r, i) => imgCand(`#${i + 1} ${r.name ?? ''}`, actressRawImage((r.image_url as string) ?? null, null)))
            .filter((x): x is ImageCandidate => x !== null)
        }
        sourceNote = variant === 'rising'
          ? '人気女優（急上昇データ無しのため get_actress_favorite_ranking にフォールバック）'
          : '人気女優（get_actress_favorite_ranking / お気に入り数）'
        break
      }

      // ── 新作 ────────────────────────────────────────────────────────
      case 'new_releases': {
        const db = svc()
        const mode = input.newMode ?? 'todays_pick'

        if (mode === 'todays_pick') {
          // metadata.todays_pick_date = 本日(JST) を優先、無ければ最新公開作。
          const today = todayJst()
          const picked = await db
            .from('articles')
            .select('title, slug, external_id, image_url, metadata, published_at')
            .eq('is_active', true)
            .eq('metadata->>todays_pick_date', today)
            .order('published_at', { ascending: false })
            .limit(1)
          let row = (picked.data ?? [])[0] as Record<string, unknown> | undefined
          if (!row) {
            const latest = await db
              .from('articles')
              .select('title, slug, external_id, image_url, metadata, published_at')
              .eq('is_active', true)
              .order('published_at', { ascending: false })
              .limit(1)
            row = (latest.data ?? [])[0] as Record<string, unknown> | undefined
          }
          if (!row) {
            return { ok: false, error: '新作データが取得できませんでした。' }
          }
          const metadata = (row.metadata as Record<string, unknown>) ?? null
          const title = String(row.title ?? '')
          const slug = String(row.slug ?? '')
          const cid = String(row.external_id ?? '')
          data = {
            postType: 'new_releases',
            templateKey: 'new_todays_pick',
            items: [],
            url: slug ? `${BASE}/articles/${slug}` : `${BASE}/`,
            singlePick: {
              name: firstActressName(metadata),
              title,
              releaseDate: fmtDate((row.published_at as string) ?? null),
            },
          }
          if (!safeMode && cid) {
            const c = imgCand(`注目新作 ${cid}`, cidToCdnUrl(cid, 'pl'))
            if (c) images = [c]
          }
          sourceNote = '本日の注目新作（articles.metadata.todays_pick_date → 最新公開作フォールバック）'
        } else {
          const limit = input.count ?? 5
          const res = await db
            .from('articles')
            .select('title, slug, external_id, image_url, metadata, published_at')
            .eq('is_active', true)
            .order('published_at', { ascending: false })
            .limit(limit)
          const rows = (res.data ?? []) as Array<Record<string, unknown>>
          if (rows.length === 0) {
            return { ok: false, error: '新着作品データが取得できませんでした。' }
          }
          const items: PostItem[] = rows.map((r, i) => ({
            rank: i + 1,
            name: workLabel((r.metadata as Record<string, unknown>) ?? null, String(r.title ?? '')),
            title: String(r.title ?? ''),
            cid: String(r.external_id ?? ''),
          }))
          data = {
            postType: 'new_releases',
            templateKey: 'new_arrivals',
            items,
            url: `${BASE}/`,
          }
          if (!safeMode) {
            images = rows
              .slice(0, 3)
              .map((r, i) => imgCand(`#${i + 1} ${r.external_id ?? ''}`, cidToCdnUrl(String(r.external_id ?? ''), 'pl')))
              .filter((x): x is ImageCandidate => x !== null)
          }
          sourceNote = '新着作品まとめ（articles / published_at 降順）'
        }
        break
      }

      // ── セール ──────────────────────────────────────────────────────
      case 'sale': {
        const campaign = SALE_CAMPAIGNS[input.campaign ?? 'chijo']
        const anchor = campaign.key === 'chijo' ? 'fanza-chijo-sale' : 'fanza-sale'
        data = {
          postType: 'sale',
          templateKey: 'sale',
          items: [],
          url: `${BASE}/#${anchor}`,
          sale: {
            name: campaign.name,
            discountLabel: campaign.discountLabel,
            count: campaign.items.length,
          },
        }
        if (!safeMode) {
          images = campaign.items
            .slice(0, 3)
            .map((it) => imgCand(it.cid, cidToCdnUrl(it.cid, it.cover ?? 'pl')))
            .filter((x): x is ImageCandidate => x !== null)
        }
        sourceNote = `セール（${campaign.name} / saleData.ts 共有定数 ${campaign.items.length}作品）`
        break
      }

      default:
        return { ok: false, error: '未対応の投稿タイプです。' }
    }

    const variants = generatePost(data)
    return {
      ok: true,
      variants,
      images,
      meta: {
        postType: data.postType,
        templateKey: data.templateKey,
        itemCount: data.items.length,
        sourceNote,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'unauthorized') return { ok: false, error: '権限がありません。' }
    return { ok: false, error: `生成に失敗しました: ${msg}` }
  }
}
