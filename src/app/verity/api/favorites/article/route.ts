import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// POST /verity/api/favorites/article
// 作品お気に入りの追加/削除。id は LS の slug|CID。articles で解決して CID で永続化。
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: unknown; action?: unknown; session_id?: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const id        = typeof body.id === 'string' ? body.id : ''
  const action    = body.action === 'remove' ? 'remove' : 'add'
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // slug もしくは external_id(CID) で作品を解決 → 永続キーは external_id
  const { data: art } = await supabase
    .from('articles')
    .select('external_id')
    .or(`slug.eq.${id},external_id.eq.${id}`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const cid = (art as { external_id: string } | null)?.external_id
  if (!cid) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

  // 保存と user_events 計上を同一tx・冪等で実行（変化時のみ favorite_work/unfavorite_work）。
  // session_id を保持。session_id 取得不可でも NULL で本処理は成功（favorite優先）。
  const { error } = await supabase.rpc('record_favorite_article', {
    p_user_id:    user.id,
    p_cid:        cid,
    p_action:     action,
    p_session_id: sessionId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action, external_id: cid })
}
