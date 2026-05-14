'use server'

import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { buildFanzaUrl } from '@/lib/fanzaUtils'

const BRAND_ID    = process.env.NEXT_PUBLIC_BRAND_ID    ?? 'verity'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL             ?? ''
const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL    ?? 'https://verity-official.com'
const GALLERY_LIMIT = 20

type RawPost = {
  id:           string
  actress_name: string
  screen_name:  string
  post_id:      string
  image_url:    string
  post_url:     string
  created_at:   string
}

export type GalleryPost = RawPost & {
  isNew:     boolean
  fanzaHref: string
}

// ── fetchMyGalleryPosts ────────────────────────────────────────────────────────
export async function fetchMyGalleryPosts(
  lastCheckedAt: string | null,
  offset: number,
  limit = GALLERY_LIMIT,
): Promise<{ posts: GalleryPost[]; hasMore: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], hasMore: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('favorite_actress_ids')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()

  const favIds: string[] = profile?.favorite_actress_ids ?? []
  if (favIds.length === 0) return { posts: [], hasMore: false }

  const { data: actressRows } = await supabase
    .from('actresses')
    .select('id, name, external_id')
    .in('id', favIds)

  const favNames = (actressRows ?? []).map(a => a.name as string)
  if (favNames.length === 0) return { posts: [], hasMore: false }

  const { data, error } = await supabase
    .from('social_feeds')
    .select('id, actress_name, screen_name, post_id, image_url, post_url, created_at')
    .in('actress_name', favNames)
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)   // limit+1 to detect hasMore

  if (error) {
    console.error('[fetchMyGalleryPosts]', error.message)
    return { posts: [], hasMore: false }
  }

  const raw     = (data as RawPost[]) ?? []
  const hasMore = raw.length > limit
  const slice   = raw.slice(0, limit)

  const threshold = lastCheckedAt ? new Date(lastCheckedAt) : null

  const actressIdMap = new Map<string, number>()
  for (const row of actressRows ?? []) {
    const match = String(row.external_id ?? '').match(/dmm-actress-(\d+)/)
    if (match) actressIdMap.set(row.name as string, parseInt(match[1], 10))
  }

  return {
    posts: slice.map(p => ({
      ...p,
      isNew:     threshold ? new Date(p.created_at) > threshold : true,
      fanzaHref: buildFanzaUrl(p.actress_name, actressIdMap.get(p.actress_name) ?? null),
    })),
    hasMore,
  }
}

// ── markGalleryAsRead ─────────────────────────────────────────────────────────
export async function markGalleryAsRead(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('profiles')
    .update({ last_gallery_checked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
}

// ── notifyAdminMissingSns ─────────────────────────────────────────────────────
// Sends one admin email per actress per 24h (global dedup via sn_sns_search_requests)
export async function notifyAdminMissingSns(
  actressExternalId: string,
  actressName: string,
): Promise<void> {
  if (!ADMIN_EMAIL) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // 24h global dedup per actress
  const { data: existing } = await supabase
    .from('sn_sns_search_requests')
    .select('last_requested_at')
    .eq('actress_id', actressExternalId)
    .maybeSingle()

  if (existing?.last_requested_at) {
    const diffH = (Date.now() - new Date(existing.last_requested_at).getTime()) / 3_600_000
    if (diffH < 24) return
  }

  // Send email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    'VERITY <noreply@verity-official.com>',
      to:      ADMIN_EMAIL,
      subject: `[VERITY] SNS捜索依頼: ${actressName}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
          <h2 style="color:#E20074;margin-bottom:4px">📡 SNS捜索依頼</h2>
          <p>ユーザー <strong>${user.email}</strong> が <strong>${actressName}</strong> をお気に入り登録しましたが、SNSアカウントが未登録です。</p>
          <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:bold;width:120px">女優名</td><td style="padding:8px 12px">${actressName}</td></tr>
            <tr><td style="padding:8px 12px;background:#f5f5f5;font-weight:bold">external_id</td><td style="padding:8px 12px;font-family:monospace;font-size:12px">${actressExternalId}</td></tr>
          </table>
          <p style="margin-bottom:4px">以下のコマンドで登録・同期できます:</p>
          <pre style="background:#1a1a1a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;font-size:13px">npx tsx scripts/update-actress-sns.ts ${actressExternalId} &lt;X_SCREEN_NAME&gt;</pre>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#888;font-size:12px">VERITY System — <a href="${SITE_URL}" style="color:#E20074">${SITE_URL}</a></p>
        </div>
      `,
    })
  } catch (e) {
    console.error('[notifyAdminMissingSns] email send failed:', e)
  }

  // Upsert dedup record
  await supabase
    .from('sn_sns_search_requests')
    .upsert({ actress_id: actressExternalId, last_requested_at: new Date().toISOString() })
}
