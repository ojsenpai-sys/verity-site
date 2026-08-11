import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// お気に入り登録済みユーザーが1人もいない状態で行を大量生成しないため、
// 行が存在しないユーザーにはアプリ側でこの初期値を返す（DBへは書き込まない）。
// Phase A方針: 女優新作通知=初期ON / 週間ランキング通知=初期OFF
const DEFAULTS = { notify_new_work: true, notify_weekly: false } as const

const ALLOWED_KEYS = ['notify_new_work', 'notify_weekly'] as const
type AllowedKey = (typeof ALLOWED_KEYS)[number]

// ── GET /verity/api/notification-settings ──────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row, error: dbErr } = await supabase
    .from('favorite_notification_settings')
    .select('notify_new_work, notify_weekly')
    .eq('user_id', user.id)
    .maybeSingle()

  if (dbErr) return NextResponse.json({ error: 'Failed to load notification settings' }, { status: 500 })

  return NextResponse.json({
    notify_new_work: row?.notify_new_work ?? DEFAULTS.notify_new_work,
    notify_weekly:   row?.notify_weekly   ?? DEFAULTS.notify_weekly,
  })
}

// ── PATCH /verity/api/notification-settings ─────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const patch: Partial<Record<AllowedKey, boolean>> = {}
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
      }
      patch[key] = body[key] as boolean
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // 未指定側は現在値（行が無ければ既定値）で埋める。
  // notify_new_work のテーブルDEFAULTはfalseだが、Phase Aの初期方針(true)を
  // 新規行のINSERT時にも明示的に反映するため、常に値を指定してupsertする。
  const { data: current } = await supabase
    .from('favorite_notification_settings')
    .select('notify_new_work, notify_weekly')
    .eq('user_id', user.id)
    .maybeSingle()

  const next = {
    notify_new_work: patch.notify_new_work ?? current?.notify_new_work ?? DEFAULTS.notify_new_work,
    notify_weekly:   patch.notify_weekly   ?? current?.notify_weekly   ?? DEFAULTS.notify_weekly,
  }

  const { data: updated, error: dbErr } = await supabase
    .from('favorite_notification_settings')
    .upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' })
    .select('notify_new_work, notify_weekly')
    .single()

  if (dbErr) return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 })

  return NextResponse.json(updated)
}
