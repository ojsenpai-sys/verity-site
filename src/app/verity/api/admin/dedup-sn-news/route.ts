/**
 * sn_news 重複下書きクリーンアップ（使い捨て管理スクリプト）
 *
 * 同一作品のメディア違い（動画配信/DVD/BD等）で重複生成された下書きを特定し、
 * デジタル優先（サフィックスなし CID）の 1件を残して残りを削除する。
 *
 * 安全基準:
 *   - is_published = true のレコードは絶対に削除しない
 *   - 同グループ内で残す 1件は: ① is_published=true > ② CID サフィックスなし > ③ 作成日古い順
 *   - dry_run=true (デフォルト) のとき削除は実行せず結果を返すのみ
 *
 * 使用方法:
 *   GET /verity/api/admin/dedup-sn-news?secret={SYNC_SECRET}           // dry-run（確認のみ）
 *   GET /verity/api/admin/dedup-sn-news?secret={SYNC_SECRET}&dry_run=false  // 実際に削除
 */

import { NextResponse }  from 'next/server'
import { createClient }  from '@supabase/supabase-js'

const SITE_KEY = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * FANZA content_id を正規化して base CID を返す。
 * generate-news/route.ts の baseCid() と同一ロジックで統一すること。
 */
function baseCid(cid: string): string {
  return cid
    .toLowerCase()
    .replace(/(?:dv|hd|so2?|vr|bd|4k|2k|bod|tk)$/i, '')  // サフィックス除去（tk含む）
    .replace(/([a-z])0+(\d)/g, '$1$2')                     // 先頭ゼロ正規化
    .replace(/^(?:\d|tk)([a-z]{2,}\d+)$/, '$1')           // 単桁またはtk-プレフィックス除去
}

/** sn_news.slug または fanza_link から content_id を抽出する */
function extractCidFromRow(row: { slug: string; fanza_link: string | null }): string | null {
  // slug = "ai-{cid}" 形式が最も確実
  const fromSlug = row.slug.replace(/^ai-/, '')
  if (fromSlug && fromSlug !== row.slug) return fromSlug

  // fanza_link から ?id=xxx または /cid=xxx を抽出
  if (row.fanza_link) {
    const m = row.fanza_link.match(/[?&/](?:id|cid)[=/]([a-z0-9]+)/i)
    if (m?.[1]) return m[1].toLowerCase()
  }
  return null
}

type SnNewsRow = {
  id:           string
  slug:         string
  title:        string
  fanza_link:   string | null
  is_published: boolean
  created_at:   string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // 認証: SYNC_SECRET
  const secret = searchParams.get('secret')
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = searchParams.get('dry_run') !== 'false'

  const db = svc()

  // ── 全下書きを取得（is_published 問わず全取得して手動で安全ガード）─────────
  const { data, error } = await db
    .from('sn_news')
    .select('id, slug, title, fanza_link, is_published, created_at')
    .eq('site_key', SITE_KEY)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SnNewsRow[]
  console.log(`[dedup-sn-news] 全記事数: ${rows.length}件`)

  // ── base CID でグループ化 ─────────────────────────────────────────────────
  const groups = new Map<string, SnNewsRow[]>()

  for (const row of rows) {
    const cid = extractCidFromRow(row)
    if (!cid) continue
    const key = baseCid(cid)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  // ── 重複グループを特定 ────────────────────────────────────────────────────
  type DuplicateGroup = {
    baseCid:  string
    keep:     SnNewsRow
    toDelete: SnNewsRow[]
  }

  const duplicateGroups: DuplicateGroup[] = []

  for (const [base, groupRows] of groups) {
    if (groupRows.length <= 1) continue

    // 優先度スコア（小さいほど優先して残す）
    const score = (row: SnNewsRow): number => {
      const cid       = extractCidFromRow(row) ?? ''
      const isDigital = baseCid(cid) === cid.toLowerCase()  // サフィックスなし = デジタル
      const isPublished = row.is_published
      if (isPublished) return 0       // 公開済みは絶対に残す
      if (isDigital)   return 1       // デジタル版を優先
      return 2                        // DVD/BD等は後回し
    }

    const sorted  = [...groupRows].sort((a, b) => score(a) - score(b))
    const keep    = sorted[0]
    const toDelete = sorted.slice(1).filter(r => !r.is_published)  // 公開済みは削除しない

    if (toDelete.length > 0) {
      duplicateGroups.push({ baseCid: base, keep, toDelete })
    }
  }

  const totalToDelete = duplicateGroups.reduce((sum, g) => sum + g.toDelete.length, 0)

  console.log(`[dedup-sn-news] 重複グループ: ${duplicateGroups.length}件 / 削除対象: ${totalToDelete}件 / dry_run=${dryRun}`)

  // ── 削除実行（dry_run=false のときのみ）──────────────────────────────────
  const deleteResults: Array<{ id: string; slug: string; status: 'deleted' | 'error'; error?: string }> = []

  if (!dryRun) {
    for (const group of duplicateGroups) {
      for (const row of group.toDelete) {
        const { error: delErr } = await db
          .from('sn_news')
          .delete()
          .eq('id', row.id)

        if (delErr) {
          console.error(`[dedup-sn-news] 削除失敗 ${row.slug}:`, delErr.message)
          deleteResults.push({ id: row.id, slug: row.slug, status: 'error', error: delErr.message })
        } else {
          console.log(`[dedup-sn-news] 削除: ${row.slug} (${row.title.slice(0, 40)})`)
          deleteResults.push({ id: row.id, slug: row.slug, status: 'deleted' })
        }
      }
    }
  }

  return NextResponse.json({
    ok:          true,
    dry_run:     dryRun,
    total_rows:  rows.length,
    dup_groups:  duplicateGroups.length,
    to_delete:   totalToDelete,
    deleted:     deleteResults.filter(r => r.status === 'deleted').length,
    errors:      deleteResults.filter(r => r.status === 'error').length,
    groups: duplicateGroups.map(g => ({
      base_cid:  g.baseCid,
      keep:      { id: g.keep.id, slug: g.keep.slug, title: g.keep.title, is_published: g.keep.is_published },
      deleted:   g.toDelete.map(r => ({ id: r.id, slug: r.slug, title: r.title })),
    })),
    delete_results: dryRun ? [] : deleteResults,
  })
}
