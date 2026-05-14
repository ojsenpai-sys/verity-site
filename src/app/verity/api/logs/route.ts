import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const VALID_TARGET_TYPES = new Set(['genre', 'actress', 'article', 'search', 'sns'])
const VALID_ACTION_TYPES = new Set(['click', 'purchase_click', 'reserve_click', 'view', 'search', 'share', 'lp_transfer', 'lp_failed'])

// POST /verity/api/logs — クリック・閲覧イベントを記録
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { target_type?: string; target_id?: string; action_type?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { target_type, target_id, action_type = 'click' } = body
  if (!VALID_TARGET_TYPES.has(target_type ?? '') || !target_id?.trim()) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  if (!VALID_ACTION_TYPES.has(action_type)) {
    return NextResponse.json({ error: 'Invalid action_type' }, { status: 400 })
  }

  const { error } = await supabase.from('sn_user_logs').insert({
    user_id:     user.id,
    brand_id:    BRAND_ID,
    action_type,
    target_type,
    target_id:   target_id.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// GET /verity/api/logs — 上位ジャンル・女優を集計して返す
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: logs } = await supabase
    .from('sn_user_logs')
    .select('target_type, target_id')
    .eq('user_id',  user.id)
    .eq('brand_id', BRAND_ID)

  const genreCount   = new Map<string, number>()
  const actressCount = new Map<string, number>()

  for (const row of logs ?? []) {
    const map = row.target_type === 'genre' ? genreCount : actressCount
    map.set(row.target_id, (map.get(row.target_id) ?? 0) + 1)
  }

  const rank = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count }))

  return NextResponse.json({
    genres:    rank(genreCount).slice(0, 10),
    actresses: rank(actressCount).slice(0, 10),
  })
}
