import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// GET /verity/api/actresses?q=<keyword>&limit=<n>
// 女優名の前方一致 / 部分一致検索（お気に入り選択用）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q     = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 30)

  if (q.length < 1) return NextResponse.json([])

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('actresses')
    .select('id, name, ruby, image_url, metadata')
    .eq('is_active', true)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(limit)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
