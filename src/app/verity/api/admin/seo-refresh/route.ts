/**
 * POST /verity/api/admin/seo-refresh
 *
 * Search Console からデータを取得し、女優名エンリッチメント・タイトル生成を行って
 * seo_suggestions / seo_cache_meta テーブルにキャッシュする。
 *
 * 認証: Supabase セッション（管理者メールアドレス一致）
 */

import { NextResponse }     from 'next/server'
import { createClient }     from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  getSearchConsoleData,
  suggestTitles,
  isTreasure,
  opportunityScore,
} from '@/lib/googleSearchConsole'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'ojsenpai@gmail.com'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST() {
  // ── 認証チェック ─────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Search Console からデータ取得 ─────────────────────────────────────────
  const { rows, isMock } = await getSearchConsoleData()

  // ── 女優ページを分類して actress_id を抽出 ────────────────────────────────
  const actressPageMap = new Map<string, string>()   // page -> actress_id
  for (const row of rows) {
    const m = row.page.match(/\/actresses\/(dmm-actress-[\w-]+)/)
    if (m) actressPageMap.set(row.page, m[1])
  }

  // ── 女優名をバッチ取得 ────────────────────────────────────────────────────
  const db = svc()
  const actressIds = [...new Set([...actressPageMap.values()])]
  const actressNameMap = new Map<string, string>()   // actress_id -> name

  if (actressIds.length > 0) {
    const { data: actresses } = await db
      .from('actresses')
      .select('external_id, name')
      .in('external_id', actressIds)

    for (const a of (actresses ?? []) as { external_id: string; name: string }[]) {
      actressNameMap.set(a.external_id, a.name)
    }
  }

  // ── タイトル提案を生成してレコードを構築 ──────────────────────────────────
  const batchId = crypto.randomUUID()
  const now     = new Date().toISOString()

  const records = rows.map(row => {
    const actressId   = actressPageMap.get(row.page)
    const actressName = actressId ? actressNameMap.get(actressId) : undefined
    const [best, ...alts] = suggestTitles(row.query, row.page, actressName)

    return {
      batch_id:        batchId,
      query:           row.query,
      page:            row.page,
      clicks:          row.clicks,
      impressions:     row.impressions,
      ctr:             row.ctr,
      position:        row.position,
      actress_name:    actressName ?? null,
      actress_id:      actressId   ?? null,
      suggested_title: best,
      alt_titles:      alts,
      is_treasure:     isTreasure(row),
      opportunity:     opportunityScore(row),
      fetched_at:      now,
    }
  })

  // ── Supabase に保存 ───────────────────────────────────────────────────────
  // 古いバッチは残して保管（履歴として活用可能）
  const { error: insertErr } = await db.from('seo_suggestions').insert(records)
  if (insertErr) {
    console.error('[seo-refresh] insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const treasureCount = records.filter(r => r.is_treasure).length

  const { error: metaErr } = await db.from('seo_cache_meta').upsert({
    singleton:      1,
    batch_id:       batchId,
    fetched_at:     now,
    row_count:      records.length,
    treasure_count: treasureCount,
    is_real:        !isMock,
  })
  if (metaErr) {
    console.error('[seo-refresh] meta upsert error:', metaErr.message)
  }

  return NextResponse.json({
    ok:       true,
    rows:     records.length,
    treasure: treasureCount,
    isMock,
    batchId,
  })
}
