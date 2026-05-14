import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

// GET /verity/api/actress-lp-ranking/[id] — 女優への LP 捧げランキング Top 10
// [id] は actress.external_id（URL スラグ）
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: actress, error: actErr } = await supabase
    .from('actresses')
    .select('id')
    .eq('external_id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (actErr || !actress) return NextResponse.json([], { status: 200 })

  const { data: rows, error: rankErr } = await supabase
    .rpc('get_actress_lp_ranking', {
      p_actress_id: actress.id,
      p_brand_id:   BRAND_ID,
      p_limit:      10,
    })

  if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 })

  return NextResponse.json(rows ?? [])
}
