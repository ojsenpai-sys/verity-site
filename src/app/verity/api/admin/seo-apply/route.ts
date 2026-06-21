/**
 * POST /verity/api/admin/seo-apply
 *
 * 提案タイトルを actresses.metadata.seo_title に適用する。
 * seo_suggestions テーブルの is_applied フラグも更新する。
 *
 * Body: { suggestionId: string; actressId: string; title: string }
 * 認証: Supabase セッション（管理者メールアドレス一致）
 */

import { NextResponse }     from 'next/server'
import { createClient }     from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'ojsenpai@gmail.com'

// サービスロールクライアント — RLS を完全にバイパスする
// SUPABASE_SERVICE_ROLE_KEY が未設定の場合はエラーを早期検出する
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      `Supabase service role env vars missing: URL=${!!url}, KEY=${!!key}`
    )
  }
  return createClient(url, key)
}

export async function POST(request: Request) {
  // ── 認証チェック ─────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── リクエストボディ ──────────────────────────────────────────────────────
  let body: { suggestionId?: string; actressId?: string; title?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { suggestionId, actressId, title } = body
  if (!actressId || !title) {
    return NextResponse.json({ error: 'actressId and title are required' }, { status: 400 })
  }

  let db: ReturnType<typeof svc>
  try {
    db = svc()
  } catch (e) {
    console.error('[seo-apply] service role init failed:', e)
    return NextResponse.json(
      { error: 'Server misconfiguration: service role key missing' },
      { status: 500 }
    )
  }

  const now = new Date().toISOString()

  // ── actresses.metadata.seo_title を更新 ───────────────────────────────────
  // .maybeSingle() — 0行でも error を throw しない（.single() はPGRST116を返す）
  const { data: current, error: selectErr } = await db
    .from('actresses')
    .select('metadata')
    .eq('external_id', actressId)
    .maybeSingle()

  if (selectErr) {
    console.error('[seo-apply] select error:', selectErr.message, '| actressId:', actressId)
    return NextResponse.json(
      { error: `DB select error: ${selectErr.message}` },
      { status: 500 }
    )
  }
  if (!current) {
    console.warn('[seo-apply] actress not found:', actressId)
    return NextResponse.json(
      { error: `Actress not found: ${actressId}` },
      { status: 404 }
    )
  }

  const updatedMeta = {
    ...(current.metadata as Record<string, unknown> | null ?? {}),
    seo_title: title,
  }

  const { error: updateErr } = await db
    .from('actresses')
    .update({ metadata: updatedMeta })
    .eq('external_id', actressId)

  if (updateErr) {
    console.error('[seo-apply] update error:', updateErr.message, '| actressId:', actressId)
    return NextResponse.json(
      { error: `DB update error: ${updateErr.message}` },
      { status: 500 }
    )
  }

  // ── seo_suggestions の is_applied を更新 ─────────────────────────────────
  if (suggestionId) {
    const { error: sugErr } = await db
      .from('seo_suggestions')
      .update({ is_applied: true, applied_at: now })
      .eq('id', suggestionId)
    if (sugErr) {
      console.error('[seo-apply] seo_suggestions update error:', sugErr.message)
      // is_applied の更新失敗は本体処理に影響しない（ログのみ）
    }
  }

  return NextResponse.json({ ok: true, actressId, title })
}
