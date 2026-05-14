/**
 * 単一記事の AI ニュース下書き生成（手動実行・ベンチマーク用）
 *
 * GET /verity/api/sync/generate-draft?cid=mida00652&slug=fukuda-yua-new-ai-rewrite
 *
 * - cid  : articles.external_id（必須）
 * - slug : sn_news に保存するスラッグ（省略時は ai-{cid}）
 * - secret: SYNC_SECRET
 */

import { NextResponse }          from 'next/server'
import { createClient }           from '@supabase/supabase-js'
import { isAuthorized }           from '@/lib/syncAuth'
import { withAffiliate }          from '@/lib/affiliate'
import {
  generateNewsFromArticle,
  articleRowToInput,
  buildNewsSlug,
  type ArticleRow,
} from '@/lib/ai/news-generator'

const SITE_KEY = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const cid         = searchParams.get('cid')
  const slugOverride = searchParams.get('slug') ?? undefined

  if (!cid) {
    return NextResponse.json({ error: 'cid パラメータが必要です' }, { status: 400 })
  }

  const db = svc()

  // ── 記事データ取得 ─────────────────────────────────────────────────────────
  const { data: row, error: fetchErr } = await db
    .from('articles')
    .select('external_id, title, image_url, published_at, tags, metadata')
    .eq('external_id', cid)
    .single()

  if (fetchErr || !row) {
    return NextResponse.json(
      { error: `articles に cid="${cid}" が見つかりません` },
      { status: 404 },
    )
  }

  const rowWithTags: ArticleRow = {
    external_id:  (row as ArticleRow).external_id,
    title:        (row as ArticleRow).title,
    image_url:    (row as ArticleRow).image_url,
    published_at: (row as ArticleRow).published_at,
    tags:         (row as { tags?: string[] | null }).tags ?? [],
    metadata:     (row as ArticleRow).metadata,
  }
  const input = articleRowToInput(rowWithTags)
  if (!input) {
    return NextResponse.json(
      { error: '女優情報が取得できません（metadata.actress が空）' },
      { status: 422 },
    )
  }

  // ── AI 生成 ────────────────────────────────────────────────────────────────
  let generated: Awaited<ReturnType<typeof generateNewsFromArticle>>
  try {
    generated = await generateNewsFromArticle(input, slugOverride ?? buildNewsSlug(cid))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync/generate-draft] AI 生成失敗:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // ── sn_news に upsert ─────────────────────────────────────────────────────
  const meta         = (row as { metadata?: Record<string, unknown> }).metadata ?? {}
  const actressId    = (meta.actress as Array<{ id: number }> | undefined)?.[0]?.id ?? 0
  const actressExtId = actressId ? `dmm-actress-${actressId}` : null
  const fanzaLink    = withAffiliate(meta.url as string | null ?? null)
  const now = new Date().toISOString()

  const { error: upsertErr } = await db
    .from('sn_news')
    .upsert(
      {
        site_key:      SITE_KEY,
        actress_id:    actressExtId,
        title:         generated.title,
        slug:          generated.slug,
        category:      'NEWS',
        content:       generated.content,
        summary:       generated.summary,
        thumbnail_url: input.imageUrl,
        gallery_urls:  JSON.stringify([]),
        fanza_link:    fanzaLink,
        tags:          generated.tags,
        is_published:  false,
        published_at:  (row as { published_at?: string | null }).published_at ?? now,
        updated_at:    now,
      },
      { onConflict: 'slug', ignoreDuplicates: false },
    )

  if (upsertErr) {
    console.error('[sync/generate-draft] upsert 失敗:', upsertErr.message)
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  console.log(`[sync/generate-draft] 完了: ${generated.slug} — ${generated.title}`)

  return NextResponse.json({
    ok:      true,
    cid,
    slug:    generated.slug,
    title:   generated.title,
    summary: generated.summary,
    tags:    generated.tags,
  })
}
