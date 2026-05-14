import { NextResponse } from 'next/server'
import { forceUpdateActressHeroImages } from '@/lib/pipeline'
import { isAuthorized } from '@/lib/syncAuth'

/**
 * POST /api/sync/actress-hero-override
 * Body: { "overrides": [{ "name": "女優名", "cid": "content_id" }, ...] }
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let overrides: Array<{ name: string; cid: string }>
  try {
    const body = await request.json()
    if (!Array.isArray(body?.overrides)) {
      return NextResponse.json(
        { error: 'Invalid body: expected { overrides: [{ name, cid }] }' },
        { status: 400 },
      )
    }
    overrides = body.overrides
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await forceUpdateActressHeroImages(overrides)
    const succeeded = result.results.filter(r => r.metaUpdated).length
    return NextResponse.json({ ok: true, succeeded, total: overrides.length, ...result })
  } catch (err) {
    console.error('[sync/actress-hero-override]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Override failed' },
      { status: 500 },
    )
  }
}
