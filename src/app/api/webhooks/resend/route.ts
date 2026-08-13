import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Resendのwebhookは Svix でラップ配信される（svix-id / svix-timestamp / svix-signature）。
// 署名検証はSvixの公開アルゴリズム（HMAC-SHA256）を手動実装し、svixパッケージは追加しない
// （このプロジェクトは通知バッチ側でも「必要最小限の依存のみ」という方針を踏襲している）。
// 参照: https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
export const dynamic = 'force-dynamic'

const TOLERANCE_SECONDS = 5 * 60 // リプレイ攻撃対策: 5分より古い/未来のタイムスタンプは拒否

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase env vars are not set')
  return createClient(url, key)
}

function verifySvixSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not set')
    return false
  }
  const svixId = headers.get('svix-id')
  const svixTimestamp = headers.get('svix-timestamp')
  const svixSignature = headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) return false

  const ts = Number(svixTimestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false

  // secretは "whsec_<base64>" 形式
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64')

  // svix-signature は "v1,<base64> v1,<base64> ..." のスペース区切り（複数署名の場合あり）
  const candidates = svixSignature.split(' ').map((s) => s.split(',')[1]).filter(Boolean)
  return candidates.some((c) => {
    const a = Buffer.from(c)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  })
}

type ResendWebhookPayload = {
  type: string
  created_at: string
  data: {
    to?: string[]
    bounce?: { type?: string; subType?: string; message?: string }
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifySvixSignature(rawBody, req.headers)) {
    console.error('[resend-webhook] signature verification failed')
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: ResendWebhookPayload
  try {
    event = JSON.parse(rawBody) as ResendWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const svixId = req.headers.get('svix-id') ?? '(unknown)'
  console.log(`[resend-webhook] received event=${event.type} svix_id=${svixId}`)

  // 抑止対象イベントのみ処理。他イベント（delivered等）は受理のみ（2xx）で無視する。
  const isHardBounce = event.type === 'email.bounced' && event.data.bounce?.type === 'Permanent'
  const isComplaint = event.type === 'email.complained'
  if (!isHardBounce && !isComplaint) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const email = event.data.to?.[0]
  if (!email) return NextResponse.json({ ok: true, ignored: true })

  try {
    const supabase = getServiceClient()
    const { data: userId, error: lookupErr } = await supabase.rpc('find_user_id_by_email', { p_email: email })
    if (lookupErr) throw new Error(lookupErr.message)
    if (!userId) {
      // VERITY会員以外（例: 問い合わせフォーム経由の宛先）宛のbounceはここで無視して良い。
      return NextResponse.json({ ok: true, ignored: true })
    }

    const now = new Date().toISOString()
    const patch = isComplaint
      ? { user_id: userId, status: 'complained', last_complained_at: now, reason: 'resend:email.complained' }
      : { user_id: userId, status: 'bounced', last_bounced_at: now, reason: `resend:email.bounced:${event.data.bounce?.subType ?? 'unknown'}` }

    const { error: upsertErr } = await supabase
      .from('notification_email_status')
      .upsert(patch, { onConflict: 'user_id' })
    if (upsertErr) throw new Error(upsertErr.message)

    console.log(`[resend-webhook] suppressed user (${isComplaint ? 'complained' : 'bounced'}) svix_id=${svixId}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    // notification_email_status 未適用（migration 048未適用）時はテーブル不在エラーになるが、
    // Resend側へは2xxを返して再送ループを避ける（抑止機能が使えないだけで実害は無い）。
    console.error('[resend-webhook] processing failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ ok: true, processed: false })
  }
}
