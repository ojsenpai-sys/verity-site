import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// App Router: raw body が必要なため dynamic 強制
export const dynamic = 'force-dynamic'

const MAX_PURCHASED_SLOTS = 27 // DB CHECK 制約に合わせる

function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(secret, { apiVersion: '2026-05-27.dahlia' })
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase env vars are not set')
  return createClient(url, key)
}

// ── SubscriptionからperiodEndを取得（新API: items.data[0].current_period_end）──
function getPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const periodEnd = subscription.items?.data?.[0]?.current_period_end
  return periodEnd ? new Date(periodEnd * 1000) : null
}

// ── サブスク有効化 ─────────────────────────────────────────────────────────────
async function activateSubscription(
  supabase: ReturnType<typeof getServiceClient>,
  profileId: string,
  expiresAt: Date | null,
) {
  const { error } = await supabase
    .from('profiles')
    .update({
      is_subscribed:           true,
      subscription_expires_at: expiresAt?.toISOString() ?? null,
    })
    .eq('user_id', profileId)

  if (error) throw new Error(`activateSubscription failed: ${error.message}`)
}

// ── サブスク無効化 ─────────────────────────────────────────────────────────────
async function deactivateSubscription(
  supabase: ReturnType<typeof getServiceClient>,
  profileId: string,
) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_subscribed: false })
    .eq('user_id', profileId)

  if (error) throw new Error(`deactivateSubscription failed: ${error.message}`)
}

// ── 購入枠を加算 ───────────────────────────────────────────────────────────────
async function addPurchasedSlots(
  supabase: ReturnType<typeof getServiceClient>,
  profileId: string,
  quantity: number,
) {
  const { data, error: fetchErr } = await supabase
    .from('profiles')
    .select('purchased_slots')
    .eq('user_id', profileId)
    .single()

  if (fetchErr) throw new Error(`addPurchasedSlots fetch failed: ${fetchErr.message}`)

  const current  = (data?.purchased_slots as number) ?? 0
  const newSlots = Math.min(current + quantity, MAX_PURCHASED_SLOTS)

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ purchased_slots: newSlots })
    .eq('user_id', profileId)

  if (updateErr) throw new Error(`addPurchasedSlots update failed: ${updateErr.message}`)
}

// ── profile_id の解決（Stripeメタデータの profile_id を使用）──────────────────
// Checkout Session / Subscription 作成時に metadata.profile_id を必ず埋め込むこと
function resolveProfileId(meta: Stripe.Metadata | null | undefined): string | null {
  return meta?.profile_id ?? null
}

// ── POST /api/webhooks/stripe ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // App Router では req.text() で生ボディを取得
  const rawBody = await req.text()
  const sig     = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event

  // ── 開発環境テスト用バイパス ────────────────────────────────────────────────
  // x-stripe-test-bypass ヘッダーが一致する場合のみ署名検証をスキップ
  const DEV_BYPASS_HEADER = 'verity-dev-2026'
  const isDev     = process.env.NODE_ENV === 'development'
  const isBypass  = req.headers.get('x-stripe-test-bypass') === DEV_BYPASS_HEADER

  if (isDev && isBypass) {
    console.warn('[stripe-webhook] ⚠️  DEV BYPASS: signature verification skipped')
    try {
      event = JSON.parse(rawBody) as Stripe.Event
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  } else {
    // ── 本番: 署名検証 ──────────────────────────────────────────────────────
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
    try {
      const stripe = getStripe()
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[stripe-webhook] Signature verification failed:', msg)
      return NextResponse.json({ error: `Webhook signature error: ${msg}` }, { status: 400 })
    }
  }

  console.log(`[stripe-webhook] Received event: ${event.type} (${event.id})`)

  try {
    const stripe   = getStripe()
    const supabase = getServiceClient()

    switch (event.type) {

      // ── ① サブスク決済成功 ─────────────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        // API 2026-05-27.dahlia: subscription は parent.subscription_details に移動
        const subDetails = invoice.parent?.type === 'subscription_details'
          ? invoice.parent.subscription_details
          : null
        const subId = typeof subDetails?.subscription === 'string'
          ? subDetails.subscription
          : (subDetails?.subscription as Stripe.Subscription | null)?.id ?? null
        if (!subId) break

        const subscription = await stripe.subscriptions.retrieve(subId)
        const profileId    = resolveProfileId(subscription.metadata)
        if (!profileId) {
          console.warn('[stripe-webhook] invoice.payment_succeeded: profile_id not in subscription metadata')
          break
        }

        const expiresAt = getPeriodEnd(subscription)
        await activateSubscription(supabase, profileId, expiresAt)
        console.log(`[stripe-webhook] Subscription activated for profile ${profileId}, expires ${expiresAt?.toISOString()}`)
        break
      }

      // ── ① サブスク作成・更新 ───────────────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        if (subscription.status !== 'active') break

        const profileId = resolveProfileId(subscription.metadata)
        if (!profileId) {
          console.warn(`[stripe-webhook] ${event.type}: profile_id not in subscription metadata`)
          break
        }

        const expiresAt = getPeriodEnd(subscription)
        await activateSubscription(supabase, profileId, expiresAt)
        console.log(`[stripe-webhook] Subscription activated for profile ${profileId}`)
        break
      }

      // ── ② 個別枠購入（checkout.session.completed, mode=payment）──────────
      case 'checkout.session.completed': {
        const session   = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'payment') break

        const profileId = resolveProfileId(session.metadata)
        if (!profileId) {
          console.warn('[stripe-webhook] checkout.session.completed: profile_id missing in metadata')
          break
        }

        const quantity = parseInt(session.metadata?.slot_quantity ?? '1', 10)
        if (isNaN(quantity) || quantity <= 0) {
          console.warn('[stripe-webhook] checkout.session.completed: invalid slot_quantity')
          break
        }

        await addPurchasedSlots(supabase, profileId, quantity)
        console.log(`[stripe-webhook] Added ${quantity} slot(s) to profile ${profileId}`)
        break
      }

      // ── ③ サブスク解約・期限切れ ──────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const profileId    = resolveProfileId(subscription.metadata)
        if (!profileId) {
          console.warn('[stripe-webhook] customer.subscription.deleted: profile_id not in subscription metadata')
          break
        }

        await deactivateSubscription(supabase, profileId)
        console.log(`[stripe-webhook] Subscription deactivated for profile ${profileId}`)
        break
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[stripe-webhook] Processing error:', msg)
    // Stripeへは200を返してリトライを防ぐ（処理エラーは内部ログで追跡）
    return NextResponse.json({ received: true, warning: msg }, { status: 200 })
  }

  return NextResponse.json({ received: true })
}
