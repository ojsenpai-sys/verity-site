/**
 * 女優プロフィール自動生成 Cron
 *
 * articles テーブルのメタデータから「女優テーブル未登録」の女優を検出し、
 * Gemini でプロフィール下書きを生成して actresses テーブルに is_active=false で保存する。
 *
 * 認証: Authorization: Bearer {CRON_SECRET}
 * 想定スケジュール: 毎日 2:00 JST (17:00 UTC)
 */

import { NextResponse }          from 'next/server'
import { createClient }           from '@supabase/supabase-js'
import {
  generateActressProfile,
  type ActressProfileInput,
} from '@/lib/ai/actress-generator'

const BATCH_SIZE = 5   // Gemini レート制限対策で小さめに

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

type ArticleMetaActress = { id: number; name: string; ruby?: string }
type ArticleMetaMaker   = { id: number; name: string }

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = svc()

  // ── Step 1: 既存女優の external_id を収集 ─────────────────────────────────
  const { data: existingRows } = await db
    .from('actresses')
    .select('external_id')

  const existingExtIds = new Set(
    (existingRows ?? []).map(r => (r as { external_id: string }).external_id),
  )
  console.log(`[cron:actress-profile] 既存女優: ${existingExtIds.size}件`)

  // ── Step 2: 直近180日の記事から未登録女優を抽出 ───────────────────────────
  const pastEdge = new Date(Date.now() - 180 * 86400_000).toISOString()

  const { data: articles, error: fetchErr } = await db
    .from('articles')
    .select('title, tags, published_at, metadata')
    .eq('is_active', true)
    .gte('published_at', pastEdge)
    .order('published_at', { ascending: false })
    .limit(500)

  if (fetchErr) {
    console.error('[cron:actress-profile] articles 取得失敗:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  // 未登録女優ごとに出演記事を集約
  const candidateMap = new Map<string, ActressProfileInput>()

  for (const art of articles ?? []) {
    const meta      = art.metadata as Record<string, unknown> | null
    const actresses = (meta?.actress as ArticleMetaActress[] | undefined) ?? []
    const maker     = (meta?.maker   as ArticleMetaMaker[]   | undefined)?.[0]?.name ?? ''

    for (const actress of actresses) {
      const extId = `dmm-actress-${actress.id}`
      if (existingExtIds.has(extId)) continue

      const entry = candidateMap.get(extId) ?? {
        dmmId:    actress.id,
        name:     actress.name,
        ruby:     actress.ruby ?? null,
        articles: [],
      }
      if (entry.articles.length < 6) {
        entry.articles.push({
          title:       (art as { title: string }).title,
          tags:        (art as { tags?: string[] | null }).tags ?? [],
          makerName:   maker,
          publishedAt: (art as { published_at?: string | null }).published_at ?? null,
        })
      }
      candidateMap.set(extId, entry)
    }
  }

  // 出演作が多い女優を優先
  const toProcess = [...candidateMap.entries()]
    .sort((a, b) => b[1].articles.length - a[1].articles.length)
    .slice(0, BATCH_SIZE)
    .map(([, v]) => v)

  console.log(`[cron:actress-profile] 処理対象: ${toProcess.length}件`)

  // ── Step 3: AI 生成 → actresses upsert ───────────────────────────────────
  const results: Array<{
    externalId: string
    name:       string
    status:     'ok' | 'error'
    error?:     string
  }> = []

  for (const input of toProcess) {
    const extId = `dmm-actress-${input.dmmId}`
    try {
      const profile = await generateActressProfile(input)

      const now = new Date().toISOString()
      const { error: upsertErr } = await db
        .from('actresses')
        .upsert(
          {
            external_id:          extId,
            name:                 profile.name,
            ruby:                 profile.ruby,
            image_url:            null,
            is_active:            false,   // 下書き（管理者レビュー後に公開）
            twitter_screen_name:  null,
            metadata: {
              dmm_id:       input.dmmId,
              ai_generated: true,
              ai_draft:     true,
              ai_bio:       profile.bio,
              ai_features:  profile.features,
              debut_year:   profile.debutYear,
              ai_tags:      profile.tags,
              generated_at: now,
            },
          },
          { onConflict: 'external_id', ignoreDuplicates: true },  // 既存レコードは上書きしない
        )

      if (upsertErr) {
        console.error(`[cron:actress-profile] upsert 失敗 ${extId}:`, upsertErr.message)
        results.push({ externalId: extId, name: input.name, status: 'error', error: upsertErr.message })
      } else {
        console.log(`[cron:actress-profile] 保存完了: ${input.name} (${extId})`)
        results.push({ externalId: extId, name: input.name, status: 'ok' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron:actress-profile] 生成失敗 ${input.name}:`, msg)
      results.push({ externalId: extId, name: input.name, status: 'error', error: msg })
    }

    // Gemini レート制限対策
    await new Promise(r => setTimeout(r, 800))
  }

  const okCount  = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'error').length
  console.log(`[cron:actress-profile] 完了 — ok:${okCount} errors:${errCount}`)

  return NextResponse.json({ ok: true, generated: okCount, errors: errCount, results })
}
