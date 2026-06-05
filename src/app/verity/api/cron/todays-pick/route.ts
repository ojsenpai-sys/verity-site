import { NextResponse } from 'next/server'
import { syncTodaysPick } from '@/lib/pipeline'

// 毎日 0:00 JST の maker-sync 完了後に呼び出す。
// Authorization: Bearer {CRON_SECRET} ヘッダーで認証。
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncTodaysPick()
    console.log('[cron:todays-pick] 完了', result)
    return NextResponse.json({ ok: true, pick: result })
  } catch (err) {
    console.error('[cron:todays-pick]', err)
    return NextResponse.json({ error: 'todays-pick sync failed' }, { status: 500 })
  }
}
