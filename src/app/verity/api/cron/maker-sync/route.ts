import { NextResponse } from 'next/server'
import { syncMakerUpcoming } from '@/lib/pipeline'

// 毎日 0:00 JST (15:00 UTC) に外部 cron から呼び出す。
// Authorization: Bearer {CRON_SECRET} ヘッダーで認証。
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncMakerUpcoming()
    console.log('[cron:maker-sync] 完了', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron:maker-sync]', err)
    return NextResponse.json({ error: 'maker sync failed' }, { status: 500 })
  }
}
