import { createClient } from '@supabase/supabase-js'
import { SOCIAL_FEED_ACTRESSES, type SocialActress } from './socialFeedActresses'

const IMAGES_PER_ACTRESS = 3
const FRESHNESS_HOURS    = 5
const REQUEST_DELAY_MS   = 300

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) console.error('[socialFeedSync] Missing Supabase env vars — writes will fail')
  return createClient(url, key)
}

function rapidApiHost() {
  return process.env.X_RAPIDAPI_HOST ?? 'twitter241.p.rapidapi.com'
}

function rapidApiHeaders() {
  return {
    'x-rapidapi-key':  process.env.X_RAPIDAPI_KEY  ?? '',
    'x-rapidapi-host': rapidApiHost(),
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── User ID resolution ────────────────────────────────────────────────────────
// Response shape: { result: { data: { user: { result: { rest_id: "123..." } } } } }

function pickRestId(json: unknown): string | null {
  try {
    const j = json as Record<string, unknown>

    const confirmed = (((j?.result as Record<string, unknown>)
                        ?.data  as Record<string, unknown>)
                        ?.user  as Record<string, unknown>)
                        ?.result as Record<string, unknown> | undefined
    if (typeof confirmed?.rest_id === 'string') return confirmed.rest_id

    const shapeB = ((j?.data as Record<string, unknown>)
                    ?.user  as Record<string, unknown>)
                    ?.result as Record<string, unknown> | undefined
    if (typeof shapeB?.rest_id === 'string') return shapeB.rest_id

    const shapeC = j?.result as Record<string, unknown> | undefined
    if (typeof shapeC?.rest_id === 'string') return shapeC.rest_id

    if (typeof j?.rest_id === 'string') return j.rest_id
  } catch { /* fall through */ }
  return null
}

async function resolveUserId(screenName: string): Promise<string | null> {
  const url = `https://${rapidApiHost()}/user?username=${encodeURIComponent(screenName)}`
  try {
    const res = await fetch(url, { headers: rapidApiHeaders(), cache: 'no-store' })
    const rawBody = await res.text()

    if (!res.ok) {
      console.error(`[social:id] HTTP ${res.status} for @${screenName}`)
      return null
    }

    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      console.error(`[social:id] Non-JSON for @${screenName}: ${rawBody.slice(0, 200)}`)
      return null
    }

    const id = pickRestId(json)
    if (!id) {
      console.error(`[social:id] rest_id not found for @${screenName} — keys: [${Object.keys(json as object).join(', ')}]`)
    }
    return id
  } catch (err) {
    console.error(`[social:id] fetch error for @${screenName}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

// ── Media fetch ───────────────────────────────────────────────────────────────

type MediaItem = { tweetId: string; imageUrl: string; postUrl: string; tweetDate: string }

async function fetchUserMedia(userId: string, screenName: string): Promise<MediaItem[]> {
  const url = `https://${rapidApiHost()}/user-media?user=${userId}&count=40`
  try {
    const res = await fetch(url, { headers: rapidApiHeaders(), cache: 'no-store' })
    const rawBody = await res.text()

    if (!res.ok) {
      console.error(`[social:media] HTTP ${res.status} for @${screenName} (userId=${userId})`)
      return []
    }

    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      console.error(`[social:media] Non-JSON for @${screenName}: ${rawBody.slice(0, 200)}`)
      return []
    }

    const j = json as Record<string, unknown>

    // Check for unavailable account (suspended / deleted / private)
    const userResult = (
      (j.data as Record<string, unknown>)?.user as Record<string, unknown>
    )?.result as Record<string, unknown> | undefined
    if (userResult?.__typename === 'UserUnavailable') {
      console.log(`[social:media] account unavailable (suspended/deleted/private) @${screenName}`)
      return []
    }

    // RapidAPI twitter241 response shape has changed over time; try multiple paths
    function getInstructions(root: Record<string, unknown>): unknown[] | undefined {
      const paths: Array<(r: Record<string, unknown>) => unknown[]  | undefined> = [
        // old shape: result.timeline.instructions
        r => ((r.result as Record<string, unknown>)?.timeline as Record<string, unknown>)?.instructions as unknown[] | undefined,
        // current shape: data.user.result.timeline_v2.timeline.instructions
        r => {
          const tl = ((userResult?.timeline_v2 as Record<string, unknown>)?.timeline as Record<string, unknown>)
          return tl?.instructions as unknown[] | undefined
        },
        // shape: data.timeline_v2.timeline.instructions
        r => (((r.data as Record<string, unknown>)?.timeline_v2 as Record<string, unknown>)?.timeline as Record<string, unknown>)?.instructions as unknown[] | undefined,
        // shape: data.timeline.instructions
        r => ((r.data as Record<string, unknown>)?.timeline as Record<string, unknown>)?.instructions as unknown[] | undefined,
      ]
      for (const path of paths) {
        const val = path(root)
        if (Array.isArray(val)) return val
      }
      return undefined
    }

    const instructions = getInstructions(j)

    if (!Array.isArray(instructions)) {
      console.error(`[social:media] instructions not found for @${screenName} — top keys: [${Object.keys(j).join(', ')}]`)
      return []
    }

    const results: MediaItem[] = []

    for (const instr of instructions) {
      if (results.length >= IMAGES_PER_ACTRESS) break

      const instrEntries: unknown[] = Array.isArray(
        (instr as Record<string, unknown>)?.entries
      ) ? ((instr as Record<string, unknown>).entries as unknown[]) : []

      for (const entry of instrEntries) {
        if (results.length >= IMAGES_PER_ACTRESS) break

        const e = entry as Record<string, unknown>
        if (!String(e.entryId ?? '').startsWith('tweet-')) continue

        const tweetResult = (
          ((e?.content as Record<string, unknown>)
            ?.itemContent as Record<string, unknown>)
            ?.tweet_results as Record<string, unknown>)
            ?.result as Record<string, unknown> | undefined

        if (!tweetResult) continue

        const tweetId = tweetResult.rest_id as string | undefined
        if (!tweetId) continue

        const legacy    = tweetResult.legacy as Record<string, unknown> | undefined
        const createdAt = (legacy?.created_at as string) ?? new Date().toISOString()
        // prefer extended_entities (multi-photo), fall back to entities
        const extMedia = (legacy?.extended_entities as Record<string, unknown>)?.media
        const entMedia = (legacy?.entities          as Record<string, unknown>)?.media
        const mediaArr = Array.isArray(extMedia) && (extMedia as unknown[]).length > 0 ? extMedia : entMedia
        const media: unknown[] = Array.isArray(mediaArr) ? (mediaArr as unknown[]) : []

        if (media.length === 0) continue

        const m0       = media[0] as Record<string, unknown>
        const imageUrl = m0?.media_url_https as string | undefined
        const postUrl  = m0?.expanded_url   as string | undefined

        if (!imageUrl) continue

        results.push({
          tweetId,
          imageUrl:  `${imageUrl}:large`,
          postUrl:   postUrl ?? `https://x.com/${screenName}/status/${tweetId}`,
          tweetDate: createdAt,
        })
      }
    }

    if (results.length === 0) {
      console.error(`[social:media] 0 photos for @${screenName} (userId=${userId})`)
    }

    return results
  } catch (err) {
    console.error(`[social:media] fetch error for @${screenName}: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

// ── Per-actress sync ──────────────────────────────────────────────────────────

type ActressResult = {
  name:       string
  screenName: string
  status:     'skipped' | 'synced' | 'no_user' | 'no_media' | 'error'
  upserted:   number
  error?:     string
}

async function syncActress(actress: SocialActress, index: number): Promise<ActressResult> {
  const supabase = getServiceClient()
  const base: ActressResult = { name: actress.name, screenName: actress.screenName, status: 'error', upserted: 0 }
  const tag = `(${index}) ${actress.name}`

  console.log(`[social] Syncing: ${tag}...`)

  try {
    const cutoff = new Date(Date.now() - FRESHNESS_HOURS * 3_600_000).toISOString()
    const { data: fresh } = await supabase
      .from('social_feeds')
      .select('updated_at')
      .eq('actress_name', actress.name)
      .gt('updated_at', cutoff)
      .limit(1)
      .maybeSingle()

    if (fresh) {
      console.log(`[social] Skipped (fresh): ${tag}`)
      return { ...base, status: 'skipped' }
    }

    const userId = await resolveUserId(actress.screenName)
    if (!userId) {
      console.error(`[social] no_user: ${tag} (@${actress.screenName})`)
      return { ...base, status: 'no_user' }
    }

    const mediaItems = await fetchUserMedia(userId, actress.screenName)
    if (mediaItems.length === 0) {
      console.error(`[social] no_media: ${tag}`)
      return { ...base, status: 'no_media' }
    }

    const now  = new Date().toISOString()
    const rows = mediaItems.map(item => ({
      actress_name: actress.name,
      screen_name:  actress.screenName,
      post_id:      item.tweetId,
      image_url:    item.imageUrl,
      post_url:     item.postUrl,
      created_at:   new Date(item.tweetDate).toISOString(),
      updated_at:   now,
    }))

    const { error } = await supabase
      .from('social_feeds')
      .upsert(rows, { onConflict: 'post_id' })

    if (error) {
      console.error(`[social] upsert error for ${tag}: ${error.message}`)
      return { ...base, status: 'error', error: error.message }
    }

    console.log(`[social] Synced ${rows.length} posts: ${tag}`)
    return { ...base, status: 'synced', upserted: rows.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[social] error for ${tag}: ${msg}`)
    return { ...base, status: 'error', error: msg }
  }
}

// ── DB + 静的リストのマージ ───────────────────────────────────────────────────
// DB の twitter_screen_name が正（update-actress-sns.ts で登録済み）。
// ビルド時定数 SOCIAL_FEED_ACTRESSES は後方互換のフォールバックとして使用。

async function buildActressList(): Promise<SocialActress[]> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('actresses')
    .select('name, twitter_screen_name')
    .not('twitter_screen_name', 'is', null)
    .eq('is_active', true)

  // マージマップ: まず静的リストを入れ、DB エントリで上書き（DB 優先）
  const merged = new Map<string, string>()
  for (const a of SOCIAL_FEED_ACTRESSES) {
    merged.set(a.name, a.screenName)
  }
  for (const row of data ?? []) {
    if (row.name && row.twitter_screen_name) {
      merged.set(row.name as string, row.twitter_screen_name as string)
    }
  }

  return Array.from(merged.entries()).map(([name, screenName]) => ({ name, screenName }))
}

// ── Main export ───────────────────────────────────────────────────────────────

export type SocialFeedSyncResult = {
  synced:  number
  skipped: number
  errors:  number
  details: ActressResult[]
}

export async function syncAllSocialFeeds(): Promise<SocialFeedSyncResult> {
  const actresses = await buildActressList()
  const total     = actresses.length
  console.log(`--- SOCIAL SYNC START --- (${total} actresses: DB+static merged)`)
  const details: ActressResult[] = []
  let synced = 0, skipped = 0, errors = 0

  for (let i = 0; i < actresses.length; i++) {
    const actress = actresses[i]
    const result  = await syncActress(actress, i + 1)
    details.push(result)

    if      (result.status === 'skipped') skipped++
    else if (result.status === 'synced')  synced++
    else                                  errors++

    if (result.status !== 'skipped') await delay(REQUEST_DELAY_MS)
  }

  console.log(`--- SOCIAL SYNC END --- synced=${synced} skipped=${skipped} errors=${errors}`)
  return { synced, skipped, errors, details }
}
