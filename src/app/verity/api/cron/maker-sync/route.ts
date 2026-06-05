import { NextResponse } from 'next/server'
import { syncMakerUpcoming, syncTodaysPick } from '@/lib/pipeline'

// 毎日 0:00 JST (15:00 UTC) に外部 cron から呼び出す。
// Authorization: Bearer {CRON_SECRET} ヘッダーで認証。
// maker-sync 完了後に syncTodaysPick() を呼び、日付変わりで即座にピックを更新する。
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let makerResult: Awaited<ReturnType<typeof syncMakerUpcoming>> | null = null
  try {
    makerResult = await syncMakerUpcoming()
    console.log('[cron:maker-sync] 完了', makerResult)
  } catch (err) {
    console.error('[cron:maker-sync] syncMakerUpcoming 失敗', err)
    return NextResponse.json({ error: 'maker sync failed' }, { status: 500 })
  }

  // 日付変わり直後に TODAY'S PICK を更新 — 失敗しても maker-sync 自体は成功扱い
  let pick: Awaited<ReturnType<typeof syncTodaysPick>> | null = null
  try {
    pick = await syncTodaysPick()
    console.log('[cron:maker-sync] today\'s pick 更新完了', pick)
  } catch (err) {
    console.error('[cron:maker-sync] syncTodaysPick 失敗 (非致命的)', err)
  }

  return NextResponse.json({ ok: true, ...makerResult, pick })
}
