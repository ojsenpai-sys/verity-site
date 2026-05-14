import { NextResponse } from 'next/server'
import { syncTopActresses } from '@/lib/pipeline'
import { isAuthorized } from '@/lib/syncAuth'

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncTopActresses()
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.log('[sync/actresses]', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
