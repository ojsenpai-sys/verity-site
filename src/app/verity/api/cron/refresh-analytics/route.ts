import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /verity/api/cron/refresh-analytics
// 分析基盤の定期更新（VPS外部cron/手動用。pg_cron(028)が有効なら不要）。
// tag_scores(026) / analytics(daily_metrics+MV) / user_profiles を順に更新。
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase env missing' }, { status: 500 })
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const results: Record<string, string> = {}
  for (const fn of ['refresh_tag_scores', 'refresh_analytics', 'refresh_user_profiles'] as const) {
    const { error } = await supabase.rpc(fn)
    results[fn] = error ? `error: ${error.message}` : 'ok'
  }

  const ok = Object.values(results).every(v => v === 'ok')
  console.log('[cron/refresh-analytics]', results)
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 })
}
