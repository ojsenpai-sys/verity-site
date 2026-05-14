import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { actress_id?: string; amount?: number }
  try { body = await request.json() } catch { body = {} }

  const { actress_id, amount = 1 } = body

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!actress_id || !uuidRe.test(actress_id)) {
    return NextResponse.json({ error: 'actress_id must be a valid UUID' }, { status: 400 })
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return NextResponse.json({ error: 'amount must be 1–100' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('transfer_lp_to_actress', {
    p_user_id:    user.id,
    p_brand_id:   BRAND_ID,
    p_actress_id: actress_id,
    p_amount:     amount,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.error) {
    const statusMap: Record<string, number> = {
      insufficient_balance:     400,
      actress_not_in_favorites: 400,
      invalid_amount:           400,
      lp_cap_reached:           400,
      unauthorized:             401,
    }
    return NextResponse.json(data, { status: statusMap[data.error] ?? 500 })
  }

  return NextResponse.json(data)
}
