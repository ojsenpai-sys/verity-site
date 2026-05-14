import { NextResponse } from 'next/server'
import { syncRecommendedActresses } from '@/lib/pipeline'
import { isAuthorized } from '@/lib/syncAuth'

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncRecommendedActresses()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[sync/recommended]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    )
  }
}
