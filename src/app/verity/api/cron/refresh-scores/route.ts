import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /verity/api/cron/refresh-scores
// materialized view (article_scores / actress_scores / tag_scores) を定期 REFRESH。
// Vercel Cron から Bearer CRON_SECRET で呼ぶ（vercel.json の crons に登録）。
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase env missing' }, { status: 500 })
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const results: Record<string, string> = {}
  for (const fn of ['refresh_article_scores', 'refresh_tag_scores'] as const) {
    const { error } = await supabase.rpc(fn)
    results[fn] = error ? `error: ${error.message}` : 'ok'
  }

  const ok = Object.values(results).every(v => v === 'ok')
  console.log('[cron/refresh-scores]', results)
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 })
}
