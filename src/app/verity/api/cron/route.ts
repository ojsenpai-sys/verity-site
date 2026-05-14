import { NextResponse } from 'next/server'
import { syncAllSources } from '@/lib/pipeline'

// Scheduled cron endpoint — invoked by Vercel Cron or an external cron service.
// Configure in vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 6,18 * * *" }] }
export async function GET(request: Request) {
  // Vercel Cron signs requests with CRON_SECRET in the Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await syncAllSources()
    const totals = results.reduce(
      (acc, r) => ({
        inserted: acc.inserted + r.inserted,
        skipped: acc.skipped + r.skipped,
        errors: acc.errors + r.errors,
      }),
      { inserted: 0, skipped: 0, errors: 0 }
    )
    console.log('[cron] sync complete', totals)
    return NextResponse.json({ ok: true, results, totals })
  } catch (err) {
    console.error('[cron]', err)
    return NextResponse.json({ error: 'Cron sync failed' }, { status: 500 })
  }
}
