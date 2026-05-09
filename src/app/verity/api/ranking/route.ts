import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Actress } from '@/lib/types'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

// GET /verity/api/ranking — ブランド内 人気女優ランキング Top 10
export async function GET() {
  const supabase = await createClient()

  // SECURITY DEFINER 関数でRLSをバイパスして全ユーザー集計
  const { data: rankRows, error: rankErr } = await supabase
    .rpc('get_actress_ranking', { p_brand_id: BRAND_ID, p_limit: 10 })

  if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 })
  if (!rankRows || rankRows.length === 0) return NextResponse.json([])

  const externalIds = (rankRows as { actress_external_id: string; points: number }[])
    .map(r => r.actress_external_id)

  const { data: actresses, error: actErr } = await supabase
    .from('actresses')
    .select('id, external_id, name, ruby, image_url, metadata')
    .in('external_id', externalIds)
    .eq('is_active', true)

  if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 })

  const actressMap = new Map(
    ((actresses ?? []) as Actress[]).map(a => [a.external_id, a])
  )

  // ランキング順（points降順）を維持して結合
  const ranked = (rankRows as { actress_external_id: string; points: number }[])
    .map((r, i) => {
      const actress = actressMap.get(r.actress_external_id)
      if (!actress) return null
      return { rank: i + 1, points: Number(r.points), actress }
    })
    .filter(Boolean)

  return NextResponse.json(ranked)
}
