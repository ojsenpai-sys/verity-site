import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

// POST /verity/api/epithets — 複数の二つ名を一括付与（冪等）
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { ids?: string[] }
  try { body = await request.json() } catch { body = {} }

  const { ids = [] } = body
  if (!Array.isArray(ids) || ids.length === 0) return NextResponse.json({ ok: true, awarded: [] })

  const now = new Date().toISOString()
  const rows = ids.map(epithet_id => ({
    user_id:     user.id,
    brand_id:    BRAND_ID,
    epithet_id,
    achieved_at: now,
  }))

  const { error } = await supabase
    .from('user_achievements')
    .upsert(rows, { onConflict: 'user_id,brand_id,epithet_id', ignoreDuplicates: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, awarded: ids })
}

// PATCH /verity/api/epithets — 二つ名を装備（null で解除）
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { epithet_id?: string | null }
  try { body = await request.json() } catch { body = {} }

  const { epithet_id } = body

  if (epithet_id !== null && epithet_id !== undefined) {
    const { data: existing } = await supabase
      .from('user_achievements')
      .select('epithet_id')
      .eq('user_id',   user.id)
      .eq('brand_id',  BRAND_ID)
      .eq('epithet_id', epithet_id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Epithet not acquired' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ equipped_epithet: epithet_id ?? null })
    .eq('user_id',  user.id)
    .eq('brand_id', BRAND_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
