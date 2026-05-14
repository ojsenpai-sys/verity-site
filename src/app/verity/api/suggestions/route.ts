import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BRAND_ID = 'verity'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { actress_name, work_title, work_id, comment } = body as Record<string, string>

  if (!actress_name && !work_title && !comment) {
    return NextResponse.json({ error: 'At least one field required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    console.error('[suggestions] Missing Supabase env vars')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 })
  }
  const supabase = createClient(url, key)

  const { error } = await supabase.from('user_suggestions').insert({
    brand_id:     BRAND_ID,
    actress_name: actress_name  || null,
    work_title:   work_title   || null,
    work_id:      work_id      || null,
    comment:      comment      || null,
  })

  if (error) {
    console.error('[suggestions] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
