import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminEmail } from '@/lib/adminAuth'

// 管理者判定（cookieセッション）
async function requireAdmin(): Promise<boolean> {
  const s = await createServerClient()
  const { data: { user } } = await s.auth.getUser()
  return isAdminEmail(user?.email)
}
function svc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

// GET: 現在の重み一覧
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc().from('preference_weights').select('event_name,weight').order('event_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weights: data ?? [] })
}

// POST: 重み更新 + 嗜好プロファイル再計算
export async function POST(request: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { weights?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const raw = Array.isArray(body.weights) ? body.weights : []
  const rows = raw
    .filter((w): w is { event_name: string; weight: number } =>
      !!w && typeof (w as { event_name: unknown }).event_name === 'string' &&
      Number.isFinite(Number((w as { weight: unknown }).weight)))
    .map(w => ({ event_name: String(w.event_name), weight: Math.max(0, Number(w.weight)) }))
    .slice(0, 50)

  if (rows.length === 0) return NextResponse.json({ error: 'no valid weights' }, { status: 400 })

  const sb = svc()
  const { error } = await sb.from('preference_weights').upsert(rows, { onConflict: 'event_name' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 重み変更を即反映（全件再計算）
  const { error: rErr } = await sb.rpc('refresh_user_profiles')
  return NextResponse.json({ ok: true, updated: rows.length, refreshed: !rErr, refreshError: rErr?.message ?? null })
}
