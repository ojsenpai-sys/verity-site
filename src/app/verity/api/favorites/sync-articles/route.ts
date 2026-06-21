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

  const rows = cids.map(cid => ({ user_id: user.id, article_external_id: cid }))
  const { error } = await supabase
    .from('favorite_articles')
    .upsert(rows, { onConflict: 'user_id,article_external_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, merged: cids.length })
}
