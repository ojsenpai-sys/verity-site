import { NextResponse, after } from 'next/server'
import { syncAllSources } from '@/lib/pipeline'
import { syncAllSocialFeeds } from '@/lib/socialFeedSync'
import { isAuthorized } from '@/lib/syncAuth'

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify env vars are loaded — helps diagnose DMM 400 errors in standalone mode
  const dmmId    = process.env.DMM_API_ID    ?? ''
  const affId    = process.env.AFFILIATE_ID  ?? ''
  const rapidKey = process.env.X_RAPIDAPI_KEY ?? ''
  console.log('[sync] DMM_API_ID   :', dmmId    ? `set (${dmmId.slice(0, 4)}…)`    : 'MISSING')
  console.log('[sync] AFFILIATE_ID :', affId    ? `set (${affId.slice(0, 4)}…)`    : 'MISSING')
  console.log('[sync] X_RAPIDAPI_KEY:', rapidKey ? 'set' : 'MISSING')

  // Run sync after the response is sent — prevents Apache/browser timeout
  after(async () => {
    console.log('--- SYNC START (background) ---')

    let articleTotals = { inserted: 0, skipped: 0, errors: 0 }
    try {
      const results = await syncAllSources()
      articleTotals = results.reduce(
        (acc, r) => ({
          inserted: acc.inserted + r.inserted,
          skipped:  acc.skipped  + r.skipped,
          errors:   acc.errors   + r.errors,
        }),
        { inserted: 0, skipped: 0, errors: 0 },
      )
      console.log('[sync] articles done —', JSON.stringify(articleTotals))
    } catch (err) {
      console.error('[sync] articles threw:', err instanceof Error ? err.message : err)
    }

    try {
      const social = await syncAllSocialFeeds()
      console.log('[sync] social done — synced:', social.synced, 'skipped:', social.skipped, 'errors:', social.errors)
    } catch (err) {
      console.error('[sync] social threw:', err instanceof Error ? err.message : err)
    }

    console.log('--- SYNC END (background) ---')
  })

  return NextResponse.json({
    ok:      true,
    status:  'processing',
    message: '同期を開始しました。完了はサーバーログで確認できます。',
    env: {
      DMM_API_ID:    dmmId    ? `set (${dmmId.slice(0, 4)}…)`    : 'MISSING',
      AFFILIATE_ID:  affId    ? `set (${affId.slice(0, 4)}…)`    : 'MISSING',
      X_RAPIDAPI_KEY: rapidKey ? 'set' : 'MISSING',
    },
  })
}
