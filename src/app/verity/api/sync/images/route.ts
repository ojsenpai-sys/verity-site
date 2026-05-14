import { NextResponse } from 'next/server'
import { patchArticleImagesJpg, revertArticleImagesToPlJpg } from '@/lib/pipeline'
import { isAuthorized } from '@/lib/syncAuth'

// ?action=patch   pl.jpg → jp.jpg 一括更新（デバッグ用）
// ?action=revert  jp.jpg → pl.jpg 一括ロールバック（デフォルト）
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url    = new URL(request.url)
  const action = url.searchParams.get('action') ?? 'revert'

  try {
    if (action === 'patch') {
      const result = await patchArticleImagesJpg()
      return NextResponse.json({ ok: true, action: 'patch', ...result })
    }
    const result = await revertArticleImagesToPlJpg()
    return NextResponse.json({ ok: true, action: 'revert', ...result })
  } catch (err) {
    console.error('[sync/images]', err)
    return NextResponse.json({ error: 'Failed', action }, { status: 500 })
  }
}
