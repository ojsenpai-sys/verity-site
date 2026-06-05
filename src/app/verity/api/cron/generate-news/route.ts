/**
 * 自動ニュース下書き生成 Cron
 *
 * 抽出優先順位（厳格）:
 *   1. actresses.is_recommended = true の女優の作品
 *   2. ブランド人気ランキング Top 30 の女優の作品（get_actress_ranking RPC）
 *   3. 上記以外の女優の作品
 *
 * 日付条件:
 *   プライマリ: published_at >= 今日 + PRIMARY_AHEAD_DAYS (デフォルト10日先以降)
 *   バックアップ: プライマリで BATCH_SIZE に満たない場合のみ、直近 BACKUP_PAST_DAYS 以内で補填
 *
 * 重複排除:
 *   同一作品の動画配信/DVD/BD等メディア違いによる二重生成を防ぐため、
 *   CID末尾のメディア識別サフィックス（dv/hd/so/so2等）を除いた base CID でも照合する。
 *
 * 認証: Authorization: Bearer {CRON_SECRET}
 */

import { NextResponse }          from 'next/server'
import { createClient }           from '@supabase/supabase-js'
import { withAffiliate }          from '@/lib/affiliate'
import { toHighResPackageUrl }    from '@/lib/cidUtils'
import {
  generateNewsFromArticle,
  articleRowToInput,
  buildNewsSlug,
  type ArticleRow,
} from '@/lib/ai/news-generator'

// ── 設定定数 ──────────────────────────────────────────────────────────────────

const SITE_KEY          = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const BATCH_SIZE        = 10
const PRIMARY_AHEAD_DAYS  = 10    // 今日から何日先以降の作品を優先対象とするか
const BACKUP_PAST_DAYS    = 120   // バックアップ時: 過去何日以内まで遡るか（60→120 に拡張）
const RANKING_TOP_N       = 30    // 人気ランキング上位何位まで優先するか
const CANDIDATE_POOL_SIZE = 1000  // 候補として取得する最大件数（500→1000 に拡張）

// ── DB クライアント ────────────────────────────────────────────────────────────

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── ユーティリティ ─────────────────────────────────────────────────────────────

function extractCid(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/[?&/](?:id|cid)[=/]([a-z0-9]+)/i)
  return m?.[1] ?? null
}

/**
 * FANZA content_id を正規化して base CID を返す。同一作品のメディア違い重複排除に使用。
 *
 * 正規化ルール（順に適用）:
 *   1. 末尾メディア/特典サフィックス除去: dv / hd / so / so2 / vr / bd / 4k / 2k / bod / tk
 *      tk = FANZA限定特典版サフィックス (例: 1drpt113tk → 1drpt113)
 *   2. 数字部分の先頭ゼロ除去: mida00652 → mida652, cawd00987 → cawd987
 *   3. 単桁/tk プレフィックス除去:
 *      - 単桁: 9kwbd427 → kwbd427
 *      - tk-prefix: tkmida652 → mida652, tkymdd494 → ymdd494 (FANZA限定特典版)
 *
 * Examples:
 *   mida00652dv→mida652, mida651bod→mida651, 9kwbd427→kwbd427
 *   tkmida652→mida652, tkymdd494→ymdd494, 1drpt113tk→drpt113
 */
function baseCid(cid: string): string {
  return cid
    .toLowerCase()
    .replace(/(?:dv|hd|so2?|vr|bd|4k|2k|bod|tk)$/i, '')  // Step 1: サフィックス除去（tk含む）
    .replace(/([a-z])0+(\d)/g, '$1$2')                     // Step 2: 先頭ゼロ正規化
    .replace(/^(?:\d|tk)([a-z]{2,}\d+)$/, '$1')           // Step 3: 単桁またはtk-プレフィックス除去
}

/** articles.metadata.actress[0].id → "dmm-actress-{id}" */
function articleActressExtId(row: ArticleRow): string | null {
  const meta     = row.metadata as Record<string, unknown> | null
  const actresses = (meta?.actress as Array<{ id: number }> | undefined) ?? []
  if (actresses.length !== 1) return null   // 単体作品のみ
  return `dmm-actress-${actresses[0].id}`
}

/**
 * 優先度を返す（小さいほど高優先）
 *   1 = is_recommended
 *   2 = top-N ranked
 *   3 = その他
 */
function priority(
  row: ArticleRow,
  recommendedIds: ReadonlySet<string>,
  rankedIds:      ReadonlySet<string>,
): 1 | 2 | 3 {
  const extId = articleActressExtId(row)
  if (!extId) return 3
  if (recommendedIds.has(extId)) return 1
  if (rankedIds.has(extId))      return 2
  return 3
}

// ── 候補記事取得 ───────────────────────────────────────────────────────────────

async function fetchCandidates(
  db: ReturnType<typeof svc>,
  fromDate: string,
  toDate:   string,
  processedCids:     ReadonlySet<string>,
  processedBaseCids: ReadonlySet<string>,
  newestFirst = false,  // Tier B（過去作補填）は最新優先で取得（古い作品が1000件制限でカットされないように）
): Promise<ArticleRow[]> {
  const { data, error } = await db
    .from('articles')
    .select('external_id, title, image_url, published_at, tags, metadata')
    .eq('is_active', true)
    .gte('published_at', fromDate)
    .lte('published_at', toDate)
    .not('image_url', 'is', null)
    .order('published_at', { ascending: !newestFirst })   // newestFirst=true で最新を先頭に
    .limit(CANDIDATE_POOL_SIZE)

  if (error) {
    console.error('[cron:generate-news] candidates 取得失敗:', error.message)
    return []
  }

  return ((data ?? []) as ArticleRow[]).filter(row => {
    // 完全一致チェック
    if (processedCids.has(row.external_id)) return false
    // base CID 一致チェック（メディア違い重複排除: mida00652dv は mida00652 処理済みならスキップ）
    if (processedBaseCids.has(baseCid(row.external_id))) return false
    const meta     = row.metadata as Record<string, unknown> | null
    const actCount = (meta?.actress as unknown[] | undefined)?.length ?? 0
    return actCount === 1   // 単体作品のみ
  })
}

// ── メインハンドラ ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db  = svc()
  const now = new Date()

  // ─ Step 1: 処理済み CID を収集（完全一致 + base CID 両方） ─────────────────
  // Supabase デフォルト1000件制限を超えて全件取得するため limit を明示
  const { data: existingNews } = await db
    .from('sn_news')
    .select('fanza_link, slug')
    .eq('site_key', SITE_KEY)
    .limit(50000)

  const processedCids     = new Set<string>()
  const processedBaseCids = new Set<string>()   // メディア違い重複排除用

  for (const row of existingNews ?? []) {
    const cid = extractCid((row as { fanza_link?: string }).fanza_link)
    if (cid) {
      processedCids.add(cid)
      processedBaseCids.add(baseCid(cid))
    }
    const slugCid = ((row as { slug: string }).slug).replace(/^ai-/, '')
    if (slugCid) {
      processedCids.add(slugCid)
      processedBaseCids.add(baseCid(slugCid))
    }
  }
  console.log(`[cron:generate-news] 処理済みCID: ${processedCids.size}件 (base: ${processedBaseCids.size}件)`)

  // ─ Step 2: is_recommended 女優の external_id セットを取得 ──────────────────
  const { data: recActresses } = await db
    .from('actresses')
    .select('external_id')
    .eq('is_recommended', true)
    .eq('is_active', true)

  const recommendedIds = new Set<string>(
    (recActresses ?? []).map((a: { external_id: string }) => a.external_id),
  )
  console.log(`[cron:generate-news] is_recommended 女優: ${recommendedIds.size}件`)

  // ─ Step 3: ブランド人気ランキング Top N の external_id セットを取得 ─────────
  const { data: rankRows } = await db
    .rpc('get_actress_ranking', { p_brand_id: SITE_KEY, p_limit: RANKING_TOP_N })

  const rankedIds = new Set<string>(
    (rankRows ?? []).map((r: { actress_external_id: string }) => r.actress_external_id),
  )
  console.log(`[cron:generate-news] ランキングTop${RANKING_TOP_N}: ${rankedIds.size}件`)

  // ─ Step 4: プライマリ候補（今日 + PRIMARY_AHEAD_DAYS 以降） ─────────────────
  const primaryFrom = new Date(now.getTime() + PRIMARY_AHEAD_DAYS * 86400_000).toISOString()
  const primaryTo   = new Date(now.getTime() + 180 * 86400_000).toISOString()

  const primaryPool = await fetchCandidates(db, primaryFrom, primaryTo, processedCids, processedBaseCids)

  // 優先度順にソート（同優先度内は発売日昇順を保持）
  primaryPool.sort((a, b) =>
    priority(a, recommendedIds, rankedIds) - priority(b, recommendedIds, rankedIds),
  )

  const toProcess = primaryPool.slice(0, BATCH_SIZE)
  console.log(
    `[cron:generate-news] プライマリ候補: ${primaryPool.length}件 → 選択: ${toProcess.length}件`,
    toProcess.map(r => ({
      cid: r.external_id,
      prio: priority(r, recommendedIds, rankedIds),
      date: r.published_at?.slice(0, 10),
    })),
  )

  // ─ Step 5: バックアップ補填（プライマリが BATCH_SIZE 未満の場合） ────────────
  // Tier A: 直近（今日〜プライマリ開始前）の近日発売作品
  // Tier B: 過去 BACKUP_PAST_DAYS 日（60日）以内の未記事化作品
  if (toProcess.length < BATCH_SIZE) {
    const needed       = BATCH_SIZE - toProcess.length
    const backupFrom   = new Date(now.getTime() - BACKUP_PAST_DAYS * 86400_000).toISOString()
    const nearTermFrom = now.toISOString()

    // Tier A: 今日〜プライマリ開始前（近日発売）
    const nearTermPool = await fetchCandidates(db, nearTermFrom, primaryFrom, processedCids, processedBaseCids)
    nearTermPool.sort((a, b) =>
      priority(a, recommendedIds, rankedIds) - priority(b, recommendedIds, rankedIds),
    )
    const nearTermSlice = nearTermPool.slice(0, needed)
    toProcess.push(...nearTermSlice)
    console.log(
      `[cron:generate-news] 近日発売補填 (Tier A): ${nearTermPool.length}件候補 → ${nearTermSlice.length}件追加`,
    )

    // Tier B: まだ足りない場合は過去 BACKUP_PAST_DAYS 日を検索
    // newestFirst=true: 今日発売の最新作が 1000 件制限の末尾に押しやられないよう新着順で取得
    if (toProcess.length < BATCH_SIZE) {
      const stillNeeded = BATCH_SIZE - toProcess.length
      const backupPool  = await fetchCandidates(db, backupFrom, nearTermFrom, processedCids, processedBaseCids, true)
      backupPool.sort((a, b) =>
        priority(a, recommendedIds, rankedIds) - priority(b, recommendedIds, rankedIds),
      )
      const backupSlice = backupPool.slice(0, stillNeeded)
      toProcess.push(...backupSlice)
      console.log(
        `[cron:generate-news] 過去作補填 (Tier B, ${BACKUP_PAST_DAYS}日): ${backupPool.length}件候補 → ${backupSlice.length}件追加`,
      )
    }
  }

  console.log(`[cron:generate-news] 最終処理対象: ${toProcess.length}件`)

  // ─ Step 6: AI 生成 → upsert ─────────────────────────────────────────────────
  const results: Array<{
    cid:    string
    slug:   string
    prio:   number
    status: 'ok' | 'skip' | 'error'
    error?: string
  }> = []

  for (const row of toProcess) {
    const input = articleRowToInput(row)
    if (!input) {
      results.push({ cid: row.external_id, slug: '', prio: 0, status: 'skip' })
      continue
    }

    const prio = priority(row, recommendedIds, rankedIds)

    try {
      const generated = await generateNewsFromArticle(input)

      const meta         = row.metadata as Record<string, unknown> | null
      const actressId    = (meta?.actress as Array<{ id: number }> | undefined)?.[0]?.id ?? 0
      const actressExtId = actressId ? `dmm-actress-${actressId}` : null
      const fanzaLink    = withAffiliate(meta?.url as string | null ?? null)

      const nowIso = new Date().toISOString()
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
            thumbnail_url: toHighResPackageUrl(input.imageUrl) ?? input.imageUrl,
            gallery_urls:  JSON.stringify([]),
            fanza_link:    fanzaLink,
            affiliate_url: fanzaLink,
            tags:          generated.tags,
            is_published:  false,
            published_at:  row.published_at ?? nowIso,
            updated_at:    nowIso,
          },
          { onConflict: 'slug', ignoreDuplicates: false },
        )

      if (upsertErr) {
        console.error(`[cron:generate-news] upsert 失敗 ${row.external_id}:`, upsertErr.message)
        results.push({ cid: row.external_id, slug: generated.slug, prio, status: 'error', error: upsertErr.message })
      } else {
        console.log(`[cron:generate-news] 生成完了 [prio=${prio}]: ${generated.slug} — ${generated.title}`)
        results.push({ cid: row.external_id, slug: generated.slug, prio, status: 'ok' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron:generate-news] 生成失敗 ${row.external_id}:`, msg)
      results.push({ cid: row.external_id, slug: buildNewsSlug(row.external_id), prio, status: 'error', error: msg })

      // スタブを挿入するのは「永続的な生成失敗」のみ。
      // 一時的なエラー（レート制限・ネットワーク断・API停止・fetch例外）はスタブを挿入せず
      // 次回 Cron で再試行させる。
      //
      // 永続的失敗の判定基準:
      //   - Gemini コンテンツフィルター（SAFETY / ブロック）
      //   - JSON パース失敗（Gemini が壊れた JSON を返した）
      //   - 必須フィールド欠損
      // 上記以外（429, 5xx, ネットワーク例外, タイムアウト等）は一時的とみなす。
      const isPermanentFailure =
        msg.includes('有効な JSON ではありません') ||
        msg.includes('必須フィールド') ||
        msg.includes('空レスポンス') ||
        msg.includes('SAFETY') ||
        msg.includes('finish_reason')
      if (isPermanentFailure) {
        const nowIso = new Date().toISOString()
        const { error: stubErr } = await db
          .from('sn_news')
          .upsert(
            {
              site_key:     SITE_KEY,
              slug:         buildNewsSlug(row.external_id),
              title:        `[AI_SKIP] ${row.external_id}`,
              category:     'NEWS',
              content:      '',
              summary:      '',
              gallery_urls: JSON.stringify([]),
              is_published: false,
              published_at: row.published_at ?? nowIso,
              updated_at:   nowIso,
              tags:         ['_ai_content_filter'],
            },
            { onConflict: 'slug', ignoreDuplicates: true },
          )
        if (stubErr) {
          console.warn(`[cron:generate-news] スタブ挿入失敗 ${row.external_id}:`, stubErr.message)
        } else {
          console.log(`[cron:generate-news] スタブ挿入完了: ${buildNewsSlug(row.external_id)} — 次回以降スキップ対象`)
        }
      }
    }

    // Gemini レート制限対策
    await new Promise(r => setTimeout(r, 600))
  }

  const okCount   = results.filter(r => r.status === 'ok').length
  const errCount  = results.filter(r => r.status === 'error').length
  const prio1     = results.filter(r => r.prio === 1).length
  const prio2     = results.filter(r => r.prio === 2).length
  const prio3     = results.filter(r => r.prio === 3).length
  console.log(
    `[cron:generate-news] 完了 — ok:${okCount} errors:${errCount} [prio1:${prio1} prio2:${prio2} prio3:${prio3}]`,
  )

  return NextResponse.json({
    ok: true,
    generated: okCount,
    errors: errCount,
    priority_breakdown: { recommended: prio1, top30: prio2, others: prio3 },
    results,
  })
}
