import { NextResponse } from 'next/server'

// 軽量ヘルスチェック（Phase 3.3）。
//
// 目的は「Next.jsプロセスが生きていて応答できるか」のみを示すこと。
// Supabase等の外部依存には一切問い合わせない — DB/Data APIの健全性は別signal
// （Supabase Dashboard / statement timeout ログ等）で見るべきであり、ここに
// 混ぜるとヘルスチェック自体がDB障害の影響を受けてしまう（本来の目的に反する）。
//
// src/proxy.ts の config.matcher で `api/health$` を除外しているため、この
// route は proxy() の supabase.auth.getUser() を経由しない。
//
// 公開エンドポイントのため、secret・バージョン番号・内部インフラ情報は含めない。
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
