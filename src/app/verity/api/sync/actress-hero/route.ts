import { NextResponse } from 'next/server'
import { syncActressHeroImages } from '@/lib/pipeline'
import { isAuthorized } from '@/lib/syncAuth'

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncActressHeroImages()
    return NextResponse.json({ ok: true, ...result, top1: result.top1 ?? null })
  } catch (err) {
    console.error('[sync/actress-hero]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    )
  }
}
