import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/notificationUnsubscribe'

// メールクライアントの自動POST（RFC 8058 One-Click）にも、メール本文内のリンクを
// 人間がクリックする通常GETにも対応する。認可はHMAC署名付きtokenのみで完結し、
// ログイン・CSRFトークンは要求しない（One-Click unsubscribeの標準的な設計。
// 悪用されても影響は「対象ユーザーの通知が1種類OFFになる」に留まり、
// 個人情報の露出や不可逆な破壊的操作は発生しない）。

function statelessAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function processUnsubscribe(token: string | null) {
  if (!token) return { ok: false as const, reason: 'malformed' as const }
  const result = verifyUnsubscribeToken(token)
  if (!result.ok) return result

  const supabase = statelessAnonClient()
  const { error } = await supabase.rpc('unsubscribe_notification', {
    p_user_id: result.userId,
    p_notification_type: result.notificationType,
  })
  if (error) {
    console.error('[unsubscribe] rpc failed:', error.message)
    return { ok: false as const, reason: 'malformed' as const }
  }
  return { ok: true as const, notificationType: result.notificationType }
}

// ── POST: RFC 8058 One-Click unsubscribe（メールクライアントが自動送信） ──────────
// 仕様上、応答は空/軽量な200・202で良く、リダイレクトや確認ページ遷移は行わない。
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  await processUnsubscribe(token)
  // 失敗時も詳細を返さない（token探索・enumeration対策）。成功可否に関わらず200。
  return new NextResponse(null, { status: 200 })
}

// ── GET: メール本文内リンクを人間がクリックした場合。成功/失敗ページへリダイレクト ──
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const result = await processUnsubscribe(token)

  const dest = new URL('/verity/unsubscribe', request.url)
  if (result.ok) {
    dest.searchParams.set('type', result.notificationType)
  } else {
    dest.searchParams.set('error', '1')
  }
  return NextResponse.redirect(dest)
}
