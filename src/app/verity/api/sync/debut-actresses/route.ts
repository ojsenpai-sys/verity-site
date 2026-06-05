import { NextResponse } from 'next/server'
import { syncDebutActresses } from '@/lib/pipeline'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncDebutActresses()
    console.log('[sync:debut-actresses] 完了', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[sync:debut-actresses]', err)
    return NextResponse.json({ error: 'debut actress sync failed' }, { status: 500 })
  }
}
