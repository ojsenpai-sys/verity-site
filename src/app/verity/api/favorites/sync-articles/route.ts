import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// POST /verity/api/favorites/sync-articles
// ログイン直後に LS の作品お気に入り(slug|CID 配列)を favorite_articles へ追加マージ。
// 既存DB側は上書きせず、重複排除して追加のみ。
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { article_ids: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const raw = body.article_ids
  if (!Array.isArray(raw) || raw.length === 0) return NextResponse.json({ ok: true, merged: 0 })

  // 文字列のみ・最大50件（DoS対策）
  const ids = raw.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 50)
  if (ids.length === 0) return NextResponse.json({ ok: true, merged: 0 })

  // slug / external_id どちらでも解決 → CID 集合
  const list = ids.map(s => `"${s.replace(/"/g, '')}"`).join(',')
  const { data: arts } = await supabase
    .from('articles')
    .select('external_id')
    .or(`slug.in.(${list}),external_id.in.(${list})`)
    .eq('is_active', true)

  const cids = [...new Set((arts as { external_id: string }[] | null ?? []).map(a => a.external_id))]
  if (cids.length === 0) return NextResponse.json({ ok: true, merged: 0 })

  // 保存と user_events 計上を RPC に集約。RPC が「実際に増えた分のみ」favorite_work を
  // 発火するため冪等（再送/リロードで二重計上されない）。
  const { data: merged, error } = await supabase.rpc('record_favorite_articles', {
    p_user_id:    user.id,
    p_cids:       cids,
    p_action:     'add',
    p_session_id: null,
    p_source:     'login_sync',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, merged: (merged as number | null) ?? 0 })
}
