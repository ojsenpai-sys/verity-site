import { NextResponse, after } from 'next/server'
import { syncAllSocialFeeds } from '@/lib/socialFeedSync'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  after(async () => {
    try {
      const result = await syncAllSocialFeeds()
      console.log('[revalidate-sns] done — synced:', result.synced, 'skipped:', result.skipped, 'errors:', result.errors)
    } catch (err) {
      console.error('[revalidate-sns] threw:', err instanceof Error ? err.message : err)
    }
  })

  return NextResponse.json({ ok: true, status: 'processing' })
}
