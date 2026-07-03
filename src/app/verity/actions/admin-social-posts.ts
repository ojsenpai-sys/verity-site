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
import { buildTrackedUrl, applyTrackCodeToBody, generateTrackCode } from '@/lib/social/attribution'
import type {
  GenerateInput,
  GenerateResult,
  ImageCandidate,
  PostData,
  PostItem,
  SavePostInput,
  SaveResult,
  SocialPostRow,
  AttributedMetrics,
  ManualMetrics,
  PostStatus,
  PostType,
  PostLangOrAll,
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
        url: data.url,
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'unauthorized') return { ok: false, error: '権限がありません。' }
    return { ok: false, error: `生成に失敗しました: ${msg}` }
  }
}

// ══ Phase 2: 履歴保存・成果記録 ══════════════════════════════════════════════

const SITE_KEY = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

function errMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg === 'unauthorized' ? '権限がありません。' : msg
}

// social_posts 未作成（mig040未適用）を検出し、画面を落とさず案内文に変換する。それ以外は生メッセージ。
function friendlyDbError(error: { code?: string; message?: string } | null): string {
  const code = error?.code ?? ''
  const msg  = error?.message ?? '不明なエラー'
  const missingTable =
    code === '42P01' || code === 'PGRST205' ||
    (/social_posts/.test(msg) && /(does not exist|find the table)/i.test(msg))
  if (missingTable) {
    return 'social_posts テーブルが未作成です（mig040未適用）。管理者は supabase/migrations/040_social_posts.sql を適用してください。'
  }
  return msg
}

function extractHashtags(body: string): string[] {
  const line = body.split('\n').find((l) => l.trim().startsWith('#'))
  if (!line) return []
  return line.trim().split(/\s+/).filter((t) => t.startsWith('#'))
}

/** 生成した1言語分を下書き保存し、?vp= 付きの投稿用テキストを返す。 */
export async function saveSocialPost(input: SavePostInput): Promise<SaveResult> {
  try {
    const user = await requireAdmin()
    const db = svc()
    const trackCode   = generateTrackCode()
    const trackedUrl  = buildTrackedUrl(input.url, trackCode)
    const trackedBody = applyTrackCodeToBody(input.body, input.url, trackCode)

    const { data, error } = await db
      .from('social_posts')
      .insert({
        site_key:         SITE_KEY,
        post_type:        input.postType,
        lang:             input.lang,
        body:             trackedBody,
        url:              trackedUrl,
        hashtags:         extractHashtags(trackedBody),
        image_candidates: input.imageCandidates,
        source_snapshot:  { sourceNote: input.sourceNote, images: input.imageCandidates },
        track_code:       trackCode,
        status:           'draft',
        created_by:       user.email ?? null,
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: friendlyDbError(error) }
    return { ok: true, id: (data as { id: string }).id, trackCode, trackedBody }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** 下書き→投稿済み。posted_at を確定（＝成果集計窓の起点）。 */
export async function markSocialPostPosted(
  id: string,
  tweetUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
    const db  = svc()
    const now = new Date().toISOString()
    const { error } = await db
      .from('social_posts')
      .update({ status: 'posted', posted_at: now, tweet_url: tweetUrl?.trim() || null, updated_at: now })
      .eq('id', id)
    if (error) return { ok: false, error: friendlyDbError(error) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** X 手入力指標の更新（0未満・非数は null 化）。 */
export async function updateSocialPostMetrics(
  id: string,
  metrics: ManualMetrics,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
    const db  = svc()
    const now = new Date().toISOString()
    const clean = (n: number | null | undefined) =>
      n == null || Number.isNaN(Number(n)) ? null : Math.max(0, Math.trunc(Number(n)))
    const { error } = await db
      .from('social_posts')
      .update({
        impressions:        clean(metrics.impressions),
        likes:              clean(metrics.likes),
        reposts:            clean(metrics.reposts),
        replies:            clean(metrics.replies),
        bookmarks:          clean(metrics.bookmarks),
        metrics_updated_at: now,
        updated_at:         now,
      })
      .eq('id', id)
    if (error) return { ok: false, error: friendlyDbError(error) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}

/** posted_at 以降の user_events を vp で突合し、投稿単位の成果を集計する。 */
async function getAttributedMetrics(
  db: ReturnType<typeof svc>,
  trackCode: string,
  sinceIso: string,
): Promise<AttributedMetrics> {
  const empty: AttributedMetrics = { fanzaClick: 0, pageView: 0, signup: 0, engagement: 0, sessions: 0 }
  const { data, error } = await db
    .from('user_events')
    .select('event_name, session_id')
    .eq('metadata->>vp', trackCode)   // ?vp= と突合
    .gte('created_at', sinceIso)      // 施策開始(posted_at)以降のみ
    .limit(20000)
  if (error || !data) return empty

  const rows = data as Array<{ event_name: string; session_id: string | null }>
  const sessions = new Set<string>()
  const m: AttributedMetrics = { ...empty }
  for (const r of rows) {
    if (r.session_id) sessions.add(r.session_id)
    switch (r.event_name) {
      case 'fanza_click':     m.fanzaClick++; break
      case 'page_view':       m.pageView++;   break
      case 'signup_complete': m.signup++;     break
      case 'video_view':
      case 'favorite_work':
      case 'actress_view':    m.engagement++; break
    }
  }
  m.sessions = sessions.size
  return m
}

/** 履歴一覧（成果は posted_at 以降のみ集計。下書きは attributed=null）。 */
export async function listSocialPosts(
  limit = 50,
): Promise<{ ok: true; rows: SocialPostRow[] } | { ok: false; error: string }> {
  try {
    await requireAdmin()
    const db = svc()
    const { data, error } = await db
      .from('social_posts')
      .select('id, post_type, lang, body, url, hashtags, track_code, status, posted_at, tweet_url, impressions, likes, reposts, replies, bookmarks, created_at')
      .eq('site_key', SITE_KEY)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { ok: false, error: friendlyDbError(error) }

    const raw = (data ?? []) as Array<Record<string, unknown>>
    const rows: SocialPostRow[] = await Promise.all(
      raw.map(async (r) => {
        const posted_at = (r.posted_at as string | null) ?? null
        const attributed = posted_at
          ? await getAttributedMetrics(db, r.track_code as string, posted_at)
          : null
        return {
          id:          r.id as string,
          post_type:   r.post_type as PostType,
          lang:        r.lang as PostLangOrAll,
          body:        r.body as string,
          url:         (r.url as string | null) ?? null,
          hashtags:    (r.hashtags as string[] | null) ?? [],
          track_code:  r.track_code as string,
          status:      r.status as PostStatus,
          posted_at,
          tweet_url:   (r.tweet_url as string | null) ?? null,
          impressions: (r.impressions as number | null) ?? null,
          likes:       (r.likes as number | null) ?? null,
          reposts:     (r.reposts as number | null) ?? null,
          replies:     (r.replies as number | null) ?? null,
          bookmarks:   (r.bookmarks as number | null) ?? null,
          created_at:  r.created_at as string,
          attributed,
        }
      }),
    )
    return { ok: true, rows }
  } catch (e) {
    return { ok: false, error: errMsg(e) }
  }
}
