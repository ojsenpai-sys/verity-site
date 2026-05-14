import { createClient } from '@supabase/supabase-js'
import type { Article, Actress, PipelineResult, Source } from './types'
import { FEATURED_CIDS, MARQUEE_SYNC_CIDS, FORCE_DIGITAL_CIDS, PINNED_ACTRESS_LATEST_CIDS } from './featuredCids'
import { cidToCdnUrl, isBadImageUrl, toHighResPackageUrl } from './cidUtils'
import { RECOMMENDED_ACTRESS_NAMES } from './recommendedActresses'
import { MOCK_ACTRESSES, MOCK_ARTICLES } from './mockData'
import {
  fetchDmmItems,
  normalizeDmmItem,
  isDmmItemExcluded,
  fetchActressImages,
  fetchActressImagesByName,
  buildActressRecords,
  type DmmItem,
} from './sources/dmm'

function getServiceClient() {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? ''
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY    ?? ''
  if (!url || !key) console.error('[pipeline] Missing Supabase env vars — writes will fail')
  return createClient(url, key)
}

function buildSlug(title: string, externalId: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
  return `${base}-${externalId.slice(0, 8)}`
}

// Normalize raw API payload into our Article shape.
// Extend this mapping per-source as needed.
function normalizeRecord(
  raw: Record<string, unknown>,
  sourceName: string
): Omit<Article, 'id' | 'fetched_at' | 'is_active'> {
  const externalId = String(raw.id ?? raw.guid ?? raw.external_id ?? '')
  const title = String(raw.title ?? raw.name ?? '')
  return {
    external_id: externalId,
    title,
    slug: buildSlug(title, externalId),
    source: sourceName,
    category: (raw.category as string) ?? null,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : null,
    summary: (raw.summary ?? raw.description) as string | null,
    content: (raw.content ?? raw.body) as string | null,
    image_url: (raw.image ?? raw.image_url ?? raw.thumbnail) as string | null,
    published_at: (raw.published_at ?? raw.date ?? raw.created_at) as string | null,
    metadata: raw as Record<string, unknown>,
  }
}

export async function runPipeline(source: Source): Promise<PipelineResult> {
  const result: PipelineResult = { inserted: 0, skipped: 0, errors: 0, source: source.name }

  if (!source.api_endpoint) return result

  const apiKey = source.api_key_env ? process.env[source.api_key_env] : undefined
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  let rawItems: Record<string, unknown>[]
  try {
    const res = await fetch(source.api_endpoint, { headers, cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    // Support { data: [...] }, { items: [...] }, or a bare array
    rawItems = Array.isArray(json) ? json : (json.data ?? json.items ?? [])
  } catch (err) {
    console.error(`[pipeline] fetch error for ${source.name}:`, err)
    result.errors++
    return result
  }

  const supabase = getServiceClient()

  for (const raw of rawItems) {
    const record = normalizeRecord(raw, source.name)
    if (!record.external_id || !record.title) {
      result.errors++
      continue
    }

    const { error } = await supabase
      .from('articles')
      .upsert(record, { onConflict: 'external_id', ignoreDuplicates: true })

    if (error) {
      console.error(
        '[pipeline] upsert failed — external_id=%s code=%s details=%s hint=%s message=%s',
        record.external_id, error.code, error.details, error.hint, error.message,
      )
      result.errors++
    } else {
      // ignoreDuplicates=true means count=0 for skipped rows; distinguish via separate select would
      // add latency — treat all successful upserts as inserted for now
      result.inserted++
    }
  }

  // Update last_synced_at on the source
  await supabase
    .from('sources')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', source.id)

  return result
}

// Seeds articles and actresses tables with mock data when no real API key is available.
export async function seedWithMockData(): Promise<PipelineResult> {
  console.log('[seed] Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('[seed] Service role key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

  const supabase = getServiceClient()
  let inserted = 0
  const errorDetails: string[] = []

  const { error: actErr } = await supabase
    .from('actresses')
    .upsert(MOCK_ACTRESSES, { onConflict: 'external_id', ignoreDuplicates: true })
  if (actErr) {
    const detail = `actresses — code:${actErr.code} message:${actErr.message} details:${actErr.details} hint:${actErr.hint}`
    console.log('[seed] actresses upsert failed:', detail)
    errorDetails.push(detail)
  }

  for (const article of MOCK_ARTICLES) {
    const { error } = await supabase
      .from('articles')
      .upsert(article, { onConflict: 'external_id', ignoreDuplicates: true })
    if (error) {
      const detail = `${article.external_id} — code:${error.code} message:${error.message} details:${error.details} hint:${error.hint}`
      console.log('[seed] article upsert failed:', detail)
      errorDetails.push(detail)
    } else {
      inserted++
    }
  }

  if (errorDetails.length > 0) {
    console.log('[seed] error summary:', JSON.stringify(errorDetails, null, 2))
  }

  return { inserted, skipped: 0, errors: errorDetails.length, source: 'dmm-mock', errorDetails }
}

export type DmmPipelineOptions = {
  /** 取得件数。本番は 50、初回テストは 1 など（デフォルト 50）*/
  hits?: number
  /** DMM フロア。将来の src/app/[siteKey] マルチブランド対応用 */
  floor?: string
  service?: string
}

/**
 * DMM API から作品を取得し、actresses → articles の順に upsert する。
 *
 * 処理フロー:
 *   1. ItemList で作品を一括取得
 *   2. 含まれる女優 ID を抽出 → ActressSearch で画像をベストエフォート取得
 *   3. actresses テーブルをバッチ upsert（ブランド横断で共有）
 *   4. articles テーブルをバッチ upsert（失敗時は個別フォールバック）
 *   5. エラーは途中で止めず最後にまとめて返す
 */
export async function runDmmPipeline(options: DmmPipelineOptions = {}): Promise<PipelineResult> {
  const { hits = 50, floor = 'videoa', service = 'digital' } = options
  const result: PipelineResult = { inserted: 0, skipped: 0, errors: 0, source: 'dmm', errorDetails: [] }

  // ── 1. ItemList 取得 ──────────────────────────────────────────────────────
  let items: Awaited<ReturnType<typeof fetchDmmItems>>
  try {
    items = await fetchDmmItems({ hits, floor, service })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log('[pipeline:dmm] ItemList 取得失敗:', msg)
    result.errors++
    result.errorDetails!.push(msg)
    return result
  }

  if (items.length === 0) {
    console.log('[pipeline:dmm] 取得件数 0 件 — 処理をスキップします')
    return result
  }

  // ── 2. 女優 ID 抽出 + ActressSearch で画像取得（ベストエフォート）────────
  const actressIds = [
    ...new Set(items.flatMap(item => item.iteminfo?.actress?.map(a => a.id) ?? [])),
  ]
  console.log(`[pipeline:dmm] ユニーク女優数: ${actressIds.length}`)

  const imageMap = actressIds.length > 0
    ? await fetchActressImages(actressIds)
    : new Map<number, string>()

  // ── 3. actresses バッチ upsert ────────────────────────────────────────────
  const actressRecords = buildActressRecords(items, imageMap)
  const supabase = getServiceClient()

  if (actressRecords.length > 0) {
    const { error: actErr } = await supabase
      .from('actresses')
      .upsert(actressRecords, { onConflict: 'external_id', ignoreDuplicates: false })

    if (actErr) {
      const detail = `actresses batch — code:${actErr.code} message:${actErr.message} details:${actErr.details}`
      console.log('[pipeline:dmm] actresses upsert 失敗:', detail)
      result.errors++
      result.errorDetails!.push(detail)
      // 女優 upsert が失敗しても作品 upsert は続行
    } else {
      console.log(`[pipeline:dmm] actresses upsert 完了: ${actressRecords.length}件`)
    }
  }

  // ── 4. articles バッチ upsert（失敗時は個別フォールバック）────────────────
  const articleRecords = items
    .filter(item => !isDmmItemExcluded(item))
    .map(item => normalizeDmmItem(item, floor))

  const { error: batchErr } = await supabase
    .from('articles')
    .upsert(articleRecords, { onConflict: 'external_id', ignoreDuplicates: false })

  if (!batchErr) {
    result.inserted = articleRecords.length
    console.log(`[pipeline:dmm] articles バッチ upsert 完了: ${result.inserted}件`)
  } else {
    // バッチ失敗 → 個別 upsert でどのレコードが原因かを特定
    console.log('[pipeline:dmm] バッチ失敗、個別 upsert にフォールバック —', batchErr.message)

    for (const record of articleRecords) {
      const { error } = await supabase
        .from('articles')
        .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })

      if (error) {
        const detail = `${record.external_id} — code:${error.code} message:${error.message} details:${error.details} hint:${error.hint}`
        console.log('[pipeline:dmm] article upsert 失敗:', detail)
        result.errors++
        result.errorDetails!.push(detail)
      } else {
        result.inserted++
      }
    }
  }

  console.log(
    `[pipeline:dmm] 完了 — inserted:${result.inserted} errors:${result.errors} floor:${floor}`
  )
  return result
}

/**
 * FANZA 人気女優ランキングを actresses テーブルに同期し、
 * 同時に人気作 100 件を articles テーブルに保存する専用パイプライン。
 *
 * 【導出ロジック】
 *   ActressSearch の sort=popular は HTTP 400 で非対応のため、
 *   ItemList sort=rank（人気順）で 100 件取得し、出演女優を初出順に
 *   重複排除した結果を「人気女優リスト」とする。
 *   ランク上位の作品に先に登場する女優 = より人気の高い女優。
 *
 * 【upsert 戦略】
 *   actresses: ignoreDuplicates: false（image_url・monthly_rank を常に上書き）
 *   articles:  ignoreDuplicates: false（image_url pt.jpg 形式を常に上書き）
 */
export async function syncTopActresses(): Promise<PipelineResult> {
  const result: PipelineResult = {
    inserted: 0,
    skipped: 0,
    errors: 0,
    source: 'dmm-actress-rank',
    errorDetails: [],
  }

  // ── 1. ItemList sort=rank で人気作 100 件を取得 ───────────────────────────
  // 失敗してもパイプラインを止めない: items=[] で継続し、step 6 で取得した
  // 日付順データだけでも保存できるようにする。
  let items: Awaited<ReturnType<typeof fetchDmmItems>> = []
  try {
    // sort=rank は FANZA では非対応 (HTTP 400)。sort=review で代替する（レビュー数多い＝人気作）。
    items = await fetchDmmItems({ hits: 100, sort: 'review', floor: 'videoa' })
    console.log(`[pipeline:actress-rank] rank fetch: ${items.length}件`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log('[pipeline:actress-rank] rank fetch 失敗 (パイプライン継続):', msg)
    result.errors++
    result.errorDetails!.push(msg)
    // ← return しない。step 6 の date 順クエリで記事は保存される。
  }

  // ── 2. 人気作への登場順で女優を重複排除（= 人気度の近似ランク）────────────
  const seenIds = new Set<number>()
  const rankedActresses: Array<{ id: number; name: string; ruby?: string }> = []

  for (const item of items) {
    for (const actress of item.iteminfo?.actress ?? []) {
      if (!seenIds.has(actress.id)) {
        seenIds.add(actress.id)
        rankedActresses.push(actress)
      }
    }
  }
  console.log(`[pipeline:actress-rank] 導出した人気女優数: ${rankedActresses.length}名`)

  // ── 3. 女優画像をベストエフォートで取得（ActressSearch actress_id）────────
  const imageMap = rankedActresses.length > 0
    ? await fetchActressImages(rankedActresses.map(a => a.id))
    : new Map<number, string>()

  // ── 4. 女優レコード組み立て（月間ランク順位・導出方法を metadata に記録）───
  const actressRecords = rankedActresses.map((a, idx) => ({
    external_id: `dmm-actress-${a.id}`,
    name:        a.name,
    ruby:        a.ruby ?? null,
    image_url:   imageMap.get(a.id) ?? null,
    is_active:   true,
    metadata: {
      dmm_id:         a.id,
      monthly_rank:   idx + 1,
      rank_method:    'itemlist_sort_rank',   // 導出方法を明示
      rank_synced_at: new Date().toISOString(),
    },
  }))

  // ── 5. actresses 上書き upsert ────────────────────────────────────────────
  const supabase = getServiceClient()
  if (actressRecords.length > 0) {
    const { error: actErr } = await supabase
      .from('actresses')
      .upsert(actressRecords, { onConflict: 'external_id', ignoreDuplicates: false })

    if (actErr) {
      const detail = `actresses upsert — code:${actErr.code} message:${actErr.message} details:${actErr.details}`
      console.log('[pipeline:actress-rank] actresses upsert 失敗:', detail)
      result.errors++
      result.errorDetails!.push(detail)
    } else {
      console.log(`[pipeline:actress-rank] actresses 更新完了: ${actressRecords.length}名`)
    }
  } else {
    console.log('[pipeline:actress-rank] rank fetch なし — actresses upsert スキップ')
  }

  // ── 6. 全方位取得: digital/videoa + mono/dvd を 7 クエリ並列で取得 ──────────
  // status=reserve は DMM API が対応していれば予約作を絞り込み、非対応なら無視される。
  // Promise.allSettled で個別失敗を吸収し、取得できた分だけマージする。
  const topActressNames = new Set(rankedActresses.map(a => a.name))

  type ItemList = Awaited<ReturnType<typeof fetchDmmItems>>

  // デジタル 4 クエリ + 通販 2 クエリ = 合計 6 並列。
  // status / list_type は DMM v3 非標準パラメータのため削除済み（400 の原因）。
  // mono/dvd は sort=date のみ使用。
  const [d1Res, d2Res, d3Res, d4Res, m1Res, m2Res] = await Promise.allSettled([
    fetchDmmItems({ hits: 100, sort: 'date', service: 'digital', floor: 'videoa', offset: 1   }),
    fetchDmmItems({ hits: 100, sort: 'date', service: 'digital', floor: 'videoa', offset: 101 }),
    fetchDmmItems({ hits: 100, sort: 'date', service: 'digital', floor: 'videoa', offset: 201 }),
    fetchDmmItems({ hits: 100, sort: 'date', service: 'digital', floor: 'videoa', offset: 301 }),
    fetchDmmItems({ hits: 100, sort: 'date', service: 'mono',    floor: 'dvd',    offset: 1   }),
    fetchDmmItems({ hits: 100, sort: 'date', service: 'mono',    floor: 'dvd',    offset: 101 }),
  ])

  function settled(res: PromiseSettledResult<ItemList>, label: string): ItemList {
    if (res.status === 'fulfilled') {
      console.log(`[pipeline:actress-rank] ${label}: ${res.value.length}件`)
      return res.value
    }
    const msg = res.reason instanceof Error ? res.reason.message : String(res.reason)
    console.log(`[pipeline:actress-rank] ${label} 失敗: ${msg}`)
    result.errors++
    result.errorDetails!.push(`${label}: ${msg}`)
    return []
  }

  const dItems1 = settled(d1Res, 'digital p1')
  const dItems2 = settled(d2Res, 'digital p2')
  const dItems3 = settled(d3Res, 'digital p3')
  const dItems4 = settled(d4Res, 'digital p4')
  const mItems1 = settled(m1Res, 'mono p1')
  const mItems2 = settled(m2Res, 'mono p2')

  const allDigitalItems = [...dItems1, ...dItems2, ...dItems3, ...dItems4]
  const allMonoItems    = [...mItems1, ...mItems2]
  const allDateItems    = [...allDigitalItems, ...allMonoItems]

  // floor 対応表: digital → videoa, mono → dvd（重複は digital 優先）
  const floorMap = new Map<string, string>()
  for (const item of allDigitalItems) floorMap.set(item.content_id, 'videoa')
  for (const item of allMonoItems) {
    if (!floorMap.has(item.content_id)) floorMap.set(item.content_id, 'dvd')
  }

  // Debug: verify specific known titles (MIDA-616, MIDA-584, etc.) are present
  {
    const debugNumbers = ['mida-616', 'mida-584', 'mida616', 'mida584']
    for (const num of debugNumbers) {
      const hit = allDateItems.find(item =>
        item.content_id.toLowerCase().includes(num.replace('-', '')) ||
        (item.number ?? '').toLowerCase().replace(/-/g, '') === num.replace('-', '')
      )
      if (hit) {
        console.log(`[pipeline:actress-rank] DEBUG ${num}: found — content_id=${hit.content_id} date=${hit.date} floor=${floorMap.get(hit.content_id) ?? '?'}`)
      } else {
        console.log(`[pipeline:actress-rank] DEBUG ${num}: NOT in allDateItems (API did not return this title)`)
      }
    }
    console.log(`[pipeline:actress-rank] allDateItems total: digital=${allDigitalItems.length} mono=${allMonoItems.length} combined=${allDateItems.length}`)
  }

  // 発売日が未来 → 先行公開 > 最新作 > 新作 の優先順は published_at DESC で自然に表現される
  const now = new Date()
  const upcoming = allDateItems.filter(item =>
    item.date && new Date(item.date.replace(/\//g, '-').replace(' ', 'T') + '+09:00') > now
  )
  console.log(`[pipeline:actress-rank] 予約/先行公開: ${upcoming.length}件`)

  // 人気女優出演作を優先
  const prioritized = allDateItems.filter(item =>
    item.iteminfo?.actress?.some(a => topActressNames.has(a.name))
  )
  console.log(`[pipeline:actress-rank] 人気女優出演作: ${prioritized.length}件`)

  // マージ優先順: 予約/先行 → 人気女優最新作 → rank 人気順 → 残り日付順
  const mergeSeenIds = new Set<string>()
  const mergedItems: typeof items = []
  for (const item of [...upcoming, ...prioritized, ...items, ...allDateItems]) {
    if (!mergeSeenIds.has(item.content_id)) {
      mergeSeenIds.add(item.content_id)
      mergedItems.push(item)
    }
  }
  console.log(`[pipeline:actress-rank] マージ後合計: ${mergedItems.length}件`)

  const articleRecords = mergedItems
    .filter(item => !isDmmItemExcluded(item))
    .map(item => normalizeDmmItem(item, floorMap.get(item.content_id) ?? 'videoa'))
  const { error: batchErr } = await supabase
    .from('articles')
    .upsert(articleRecords, { onConflict: 'external_id', ignoreDuplicates: false })

  if (!batchErr) {
    result.inserted = articleRecords.length
    console.log(`[pipeline:actress-rank] articles upsert 完了: ${result.inserted}件`)
  } else {
    console.log('[pipeline:actress-rank] バッチ失敗、個別フォールバック —', batchErr.message)
    for (const record of articleRecords) {
      const { error } = await supabase
        .from('articles')
        .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })
      if (error) {
        const detail = `${record.external_id} — code:${error.code} message:${error.message}`
        console.log('[pipeline:actress-rank] article 失敗:', detail)
        result.errors++
        result.errorDetails!.push(detail)
      } else {
        result.inserted++
      }
    }
  }

  // ── 7. 補完: allDateItems 出演女優を actresses テーブルにサプリメント upsert ────
  // rank-100 に入っていない女優（mono/dvd 専業、オフランク期など）も articles.tags
  // に名前が入っているため、actresses テーブルにレコードがないと詳細ページが 404 に
  // なる。名前ベースの重複チェックでデジタル/通販の ID 違いによる多重登録を防ぐ。
  {
    const rankedIdSet   = new Set(rankedActresses.map(a => a.id))
    const rankedNameSet = new Set(rankedActresses.map(a => a.name))
    const suppMap = new Map<number, { id: number; name: string; ruby?: string }>()

    for (const item of allDateItems) {
      for (const a of item.iteminfo?.actress ?? []) {
        if (!rankedIdSet.has(a.id) && !suppMap.has(a.id)) {
          suppMap.set(a.id, a)
        }
      }
    }

    if (suppMap.size > 0) {
      const suppActresses = Array.from(suppMap.values())

      // ── 名前ベース重複チェック: ranked 女優と同名なら ID が違っても除外 ──────
      const { data: existingRows } = await supabase
        .from('actresses')
        .select('name')
        .in('name', suppActresses.map(a => a.name))

      const existingNameSet = new Set([
        ...rankedNameSet,
        ...(existingRows?.map(r => r.name as string) ?? []),
      ])

      const deduped = suppActresses.filter(a => !existingNameSet.has(a.name))
      const nameSkipped = suppActresses.length - deduped.length
      console.log(`[pipeline:actress-rank] 補完女優候補: ${suppActresses.length}名 (名前重複スキップ: ${nameSkipped}名, 新規: ${deduped.length}名)`)

      if (deduped.length > 0) {
        const suppIds      = deduped.slice(0, 100).map(a => a.id)
        const suppImageMap = await fetchActressImages(suppIds)

        const suppRecords = deduped.map(a => ({
          external_id: `dmm-actress-${a.id}`,
          name:        a.name,
          ruby:        a.ruby ?? null,
          image_url:   suppImageMap.get(a.id) ?? null,
          is_active:   true,
          metadata:    { dmm_id: a.id },
        }))

        const { error: suppErr } = await supabase
          .from('actresses')
          .upsert(suppRecords, { onConflict: 'external_id', ignoreDuplicates: true })

        if (!suppErr) {
          console.log(`[pipeline:actress-rank] 補完女優 upsert 完了: ${suppRecords.length}名`)
        } else {
          console.log('[pipeline:actress-rank] 補完女優 upsert 失敗:', suppErr.message)
        }
      }
    }
  }

  // ── 7b. プロフィール画像の強制補完（名前ベース ActressSearch）─────────────────
  // ranked 女優で image_url が null のものは ID バッチで取れなかった証拠。
  // 名前キーワード検索でもう一度トライして DB を更新する。
  {
    const nullImageActresses = actressRecords.filter(a => a.image_url === null)
    if (nullImageActresses.length > 0) {
      const names = nullImageActresses.map(a => a.name)
      console.log(`[pipeline:actress-rank] プロフィール画像未取得: ${names.join(', ')}`)

      const nameImageMap = await fetchActressImagesByName(names)
      const profileUpdates = nullImageActresses
        .filter(a => nameImageMap.has(a.name))
        .map(a => ({ ...a, image_url: nameImageMap.get(a.name)! }))

      if (profileUpdates.length > 0) {
        const { error } = await supabase
          .from('actresses')
          .upsert(profileUpdates, { onConflict: 'external_id', ignoreDuplicates: false })

        const updatedNames = profileUpdates.map(a => a.name)
        if (!error) {
          console.log(`[pipeline:actress-rank] プロフィール画像補完完了: ${updatedNames.join(', ')}`)
        } else {
          console.log('[pipeline:actress-rank] プロフィール画像補完 upsert 失敗:', error.message)
        }
      }
    }
  }

  // ── 7c. 福田ゆあ デバッグ + 名前ベース紐付け件数サマリー ─────────────────────
  {
    const debugActressName = '福田ゆあ'
    const debugWorks = mergedItems.filter(item =>
      item.iteminfo?.actress?.some(a => a.name === debugActressName)
    )
    if (debugWorks.length > 0) {
      console.log(`[pipeline:actress-rank] DEBUG "${debugActressName}": ${debugWorks.length}件同期`)
      for (const w of debugWorks) {
        const actressId = w.iteminfo?.actress?.find(a => a.name === debugActressName)?.id
        console.log(`  → ${w.content_id} | ${w.date} | id=${actressId} | ${w.title.slice(0, 50)}`)
      }
    } else {
      console.log(`[pipeline:actress-rank] DEBUG "${debugActressName}": allDateItems に出演作なし (API 側の問題)`)
    }

    // 名前ベースで紐付けた作品数サマリー（タグに actress.name が含まれる全作品）
    const actressWorkCounts = new Map<string, number>()
    for (const item of mergedItems) {
      for (const a of item.iteminfo?.actress ?? []) {
        actressWorkCounts.set(a.name, (actressWorkCounts.get(a.name) ?? 0) + 1)
      }
    }
    console.log(`[pipeline:actress-rank] 名前ベース紐付け: ${actressWorkCounts.size}名 / ${mergedItems.length}作品`)
  }

  // ── 8. 特集 CID の直接取得（メインフェッチで拾えなかった作品を保証）───────────
  // FeaturedSection で表示する CID がメインの 8 クエリに含まれなかった場合でも
  // keyword 検索で digital/mono 両方を試み、内容が豊富な方（sample_movie_url 優先）
  // を DB に保存する。
  //
  // DMM の keyword 検索は content_id（mida616）より product_id 形式（MIDA-616）の方が
  // ヒット率が高い。cidToProductNumber で変換してから検索し、結果は content_id で照合する。
  {
    // content_id "mida616" → keyword "MIDA-616"
    function cidToProductNumber(cid: string): string {
      const m = cid.match(/^(.*?)(\d+)$/)
      return m ? `${m[1].toUpperCase()}-${m[2]}` : cid.toUpperCase()
    }

    // FEATURED_CIDS + MARQUEE_SYNC_CIDS を常に個別再取得する。
    // メインバッチで取得済みでも keyword 検索（digital + mono 両方）で上書きすることで
    // image_url の正確性を保証する。
    const toFetch = [...FEATURED_CIDS, ...MARQUEE_SYNC_CIDS]

    {
      console.log(`[pipeline:actress-rank] 特集 CID 補完 (${toFetch.length}件): ${toFetch.join(', ')}`)
      let featuredSaved = 0

      for (const cid of toFetch) {
        // 各 CID を個別 try-catch で囲み、1件の失敗が他の保存を妨げないようにする
        try {
          const keyword = cidToProductNumber(cid)
          console.log(`[pipeline:actress-rank] 特集 ${cid} → keyword="${keyword}"`)

          const [dRes, mRes] = await Promise.allSettled([
            fetchDmmItems({ keyword, hits: 10, service: 'digital', floor: 'videoa' }),
            fetchDmmItems({ keyword, hits: 10, service: 'mono',    floor: 'dvd'    }),
          ])

          if (dRes.status === 'rejected') {
            console.log(`[pipeline:actress-rank]   digital 失敗: ${dRes.reason instanceof Error ? dRes.reason.message : String(dRes.reason)}`)
          }
          if (mRes.status === 'rejected') {
            console.log(`[pipeline:actress-rank]   mono 失敗: ${mRes.reason instanceof Error ? mRes.reason.message : String(mRes.reason)}`)
          }

          const dItems = (dRes.status === 'fulfilled' ? dRes.value : [] as ItemList)
            .filter(i => i.content_id === cid)
          const mItems = (mRes.status === 'fulfilled' ? mRes.value : [] as ItemList)
            .filter(i => i.content_id === cid)

          console.log(`[pipeline:actress-rank]   digital hits: ${dRes.status === 'fulfilled' ? dRes.value.length : 'err'} (matched: ${dItems.length}) / mono hits: ${mRes.status === 'fulfilled' ? mRes.value.length : 'err'} (matched: ${mItems.length})`)

          const best =
            dItems.find(i => i.sampleMovieURL) ??
            mItems.find(i => i.sampleMovieURL) ??
            dItems[0] ?? mItems[0] ?? null

          if (!best) {
            console.log(`[pipeline:actress-rank]   ${cid}: API で見つからず — スキップ`)
            continue
          }

          const itemFloor = mItems.includes(best) ? 'dvd' : 'videoa'
          const record = normalizeDmmItem(best, itemFloor)

          const { error: cidErr } = await supabase
            .from('articles')
            .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })

          if (!cidErr) {
            featuredSaved++
            result.inserted++
            console.log(`[pipeline:actress-rank]   ${cid} DB保存完了 (floor=${itemFloor}): ${best.title.slice(0, 45)}`)
          } else {
            console.log(`[pipeline:actress-rank]   ${cid} DB保存失敗: code=${cidErr.code} ${cidErr.message}`)
            result.errors++
            result.errorDetails!.push(`featured ${cid}: ${cidErr.message}`)
          }
        } catch (err) {
          console.log(`[pipeline:actress-rank]   ${cid} 例外: ${err instanceof Error ? err.message : String(err)}`)
          result.errors++
          result.errorDetails!.push(`featured ${cid}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      console.log(`[pipeline:actress-rank] 特集 CID 完了: ${featuredSaved}/${toFetch.length}件 DB保存`)
    }
  }

  console.log(
    `[pipeline:actress-rank] 完了 — actresses:${actressRecords.length} articles:${result.inserted} errors:${result.errors}`
  )
  return result
}

/**
 * articles テーブルの image_url を pl.jpg → jp.jpg に一括置換する。
 * DMM API は呼ばない — DB の既存 URL をそのまま書き換えるだけ。
 * jp.jpg が存在しない作品はプロキシが pl.jpg → ps.jpg にフォールバックする。
 */
export async function patchArticleImagesJpg(): Promise<{ updated: number; errors: number }> {
  const supabase = getServiceClient()
  let updated = 0
  let errors  = 0
  let offset  = 0
  const PAGE  = 500

  console.log('[patch-images] pl.jpg → jp.jpg 一括置換を開始')

  for (;;) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, image_url')
      .like('image_url', '%pl.jpg')
      .range(offset, offset + PAGE - 1)

    if (error) {
      console.error('[patch-images] fetch error:', error.message)
      errors++
      break
    }
    if (!data || data.length === 0) break

    // upsert は他の NOT NULL カラムが欠けるため使えない。
    // 個別 UPDATE を 20 並列で実行する。
    const CONCURRENT = 20
    for (let i = 0; i < data.length; i += CONCURRENT) {
      const chunk = data.slice(i, i + CONCURRENT)
      const results = await Promise.allSettled(
        chunk.map(row =>
          supabase
            .from('articles')
            .update({ image_url: (row.image_url as string).replace(/pl\.jpg$/, 'jp.jpg') })
            .eq('id', row.id as string)
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) {
          updated++
        } else {
          const msg = r.status === 'rejected'
            ? String(r.reason)
            : r.value.error!.message
          console.error('[patch-images] update error:', msg)
          errors++
        }
      }
    }
    console.log(`[patch-images] ${updated} 件更新済み (errors: ${errors})`)

    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`[patch-images] 完了 — updated:${updated} errors:${errors}`)
  return { updated, errors }
}

/**
 * articles テーブルの image_url を jp.jpg → pl.jpg に一括ロールバックする。
 * jp.jpg は DMM デジタル商品では存在しない（CDN が 200 + 2.7KB プレースホルダを返す）ため、
 * canonical の pl.jpg に戻す。プロキシが jp.jpg へのアップグレードを透過的に試みる。
 */
export async function revertArticleImagesToPlJpg(): Promise<{ reverted: number; errors: number }> {
  const supabase = getServiceClient()
  let reverted = 0
  let errors   = 0
  let offset   = 0
  const PAGE   = 500

  console.log('[revert-images] jp.jpg → pl.jpg 一括ロールバックを開始')

  for (;;) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, image_url')
      .like('image_url', '%jp.jpg')
      .range(offset, offset + PAGE - 1)

    if (error) {
      console.error('[revert-images] fetch error:', error.message)
      errors++
      break
    }
    if (!data || data.length === 0) break

    const CONCURRENT = 20
    for (let i = 0; i < data.length; i += CONCURRENT) {
      const chunk = data.slice(i, i + CONCURRENT)
      const results = await Promise.allSettled(
        chunk.map(row =>
          supabase
            .from('articles')
            .update({ image_url: (row.image_url as string).replace(/jp\.jpg$/, 'pl.jpg') })
            .eq('id', row.id as string)
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) {
          reverted++
        } else {
          const msg = r.status === 'rejected'
            ? String(r.reason)
            : r.value.error!.message
          console.error('[revert-images] update error:', msg)
          errors++
        }
      }
    }
    console.log(`[revert-images] ${reverted} 件ロールバック済み (errors: ${errors})`)

    if (data.length < PAGE) break
    offset += PAGE
  }

  console.log(`[revert-images] 完了 — reverted:${reverted} errors:${errors}`)
  return { reverted, errors }
}

// ─── Actress Hero Sync ────────────────────────────────────────────────────────

type ArticleRow = {
  external_id:  string
  title:        string
  image_url:    string | null
  published_at: string | null
  metadata:     unknown
}

/**
 * 単体作を優先してオムニバス（3名以上）を除外する。
 * rows は published_at 降順で渡すこと。
 * 同一 actress_count の場合は digital/video パスの画像を持つ記事を優先する
 * （mono 版・数量限定 BD が発売日で上回る場合に digital 版を選ぶため）。
 */
function pickBestArticle(rows: ArticleRow[]): ArticleRow | null {
  if (rows.length === 0) return null
  const actressCount = (r: ArticleRow) => {
    const meta = r.metadata as Record<string, unknown> | null
    if (!Array.isArray(meta?.actress)) return 0
    return (meta!.actress as unknown[]).length
  }
  const isDigital = (r: ArticleRow) =>
    typeof r.image_url === 'string' && r.image_url.includes('/digital/video/')
  const eligible = rows.filter(r => {
    const n = actressCount(r)
    return n === 0 || n < 3
  })
  if (eligible.length === 0) return null
  const priority = (n: number) => (n === 1 ? 0 : n === 2 ? 1 : 2)
  // 同 actress_count 内では digital 優先 (0) > mono (1)
  return eligible.slice().sort((a, b) => {
    const ap = priority(actressCount(a))
    const bp = priority(actressCount(b))
    if (ap !== bp) return ap - bp
    return (isDigital(a) ? 0 : 1) - (isDigital(b) ? 0 : 1)
  })[0]
}

/**
 * FANZA 月間ランキング Top 50 女優 + VERITY オススメ女優の「最新作」を特定し、
 * actresses.metadata.latest_cid / hero_rank を更新する。
 *
 * 解決戦略:
 *   - 高速パス: DB の articles テーブルを tags @> [name] で検索（API コールなし）
 *   - DB 未収録の場合のみ DMM keyword 検索で 1 件補完
 */
export async function syncActressHeroImages(): Promise<{
  processed: number
  fromDb:    number
  fromApi:   number
  errors:    number
  top1?:     { name: string; cid: string; title: string; imageUrl: string }
}> {
  const supabase = getServiceClient()
  const result: {
    processed: number; fromDb: number; fromApi: number; errors: number
    top1?: { name: string; cid: string; title: string; imageUrl: string }
  } = { processed: 0, fromDb: 0, fromApi: 0, errors: 0 }

  // ── A. 月間ランキング Top 50 ────────────────────────────────────────────────
  const { data: allActresses } = await supabase
    .from('actresses')
    .select('id, external_id, name, image_url, metadata')
    .eq('is_active', true)

  const ranked = ((allActresses ?? []) as Actress[])
    .filter(a => (a.metadata?.monthly_rank as number | undefined) != null)
    .sort((a, b) =>
      ((a.metadata!.monthly_rank as number) ?? 9999) -
      ((b.metadata!.monthly_rank as number) ?? 9999)
    )
    .slice(0, 50)

  console.log(`[hero-sync] 月間ランキング対象: ${ranked.length}名`)

  // ── B. VERITY オススメ女優（FEATURED_CIDS 記事の actress メタデータから導出）──
  const { data: featuredArticles } = await supabase
    .from('articles')
    .select('metadata')
    .in('external_id', [...FEATURED_CIDS, ...MARQUEE_SYNC_CIDS])
    .eq('is_active', true)

  const featuredActressNames = new Set<string>()
  for (const art of featuredArticles ?? []) {
    const list = (art.metadata as Record<string, unknown>)?.actress as Array<{ name: string }> | undefined
    for (const a of list ?? []) { if (a.name) featuredActressNames.add(a.name) }
  }

  const rankedNameSet = new Set(ranked.map(a => a.name))
  const verityOnlyNames = [...featuredActressNames].filter(n => !rankedNameSet.has(n))

  let verityActresses: Actress[] = []
  if (verityOnlyNames.length > 0) {
    const { data } = await supabase
      .from('actresses')
      .select('id, external_id, name, metadata')
      .in('name', verityOnlyNames)
      .eq('is_active', true)
    verityActresses = (data ?? []) as Actress[]
  }

  // Merge: ranked (1…50) first, then VERITY-only after
  type TargetActress = Actress & { heroRank: number }
  const allTargets: TargetActress[] = [
    ...ranked.map((a, i) => ({
      ...a,
      heroRank: (a.metadata?.monthly_rank as number | undefined) ?? (i + 1),
    })),
    ...verityActresses.map((a, i) => ({ ...a, heroRank: ranked.length + i + 1 })),
  ]

  console.log(
    `[hero-sync] 処理対象: ${allTargets.length}名 (ランク:${ranked.length} VERITYのみ:${verityActresses.length})`
  )

  // ── C. 各女優の最新作を解決（10 並列）────────────────────────────────────────
  const CONCURRENT = 10
  for (let i = 0; i < allTargets.length; i += CONCURRENT) {
    const chunk = allTargets.slice(i, i + CONCURRENT)
    await Promise.allSettled(
      chunk.map(async (actress) => {
        try {
          let latestCid:      string | null = null
          let latestTitle:    string | null = null
          let latestImageUrl: string | null = null

          // 高速パス: DB で tags @> [名前] の最新記事を検索（単体優先・オムニバス除外）
          const { data: dbRows } = await supabase
            .from('articles')
            .select('external_id, title, image_url, published_at, metadata')
            .eq('is_active', true)
            .contains('tags', [actress.name])
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(20)

          const best = pickBestArticle((dbRows ?? []) as ArticleRow[])
          if (best) {
            latestCid      = best.external_id as string
            latestTitle    = best.title       as string
            latestImageUrl = best.image_url   as string
            result.fromDb++
            console.log(`[hero-sync] DB  ${actress.name}: ${latestCid}`)
          } else {
            // API フォールバック: DMM keyword 検索（上位 5 件を日付降順でソート）
            result.fromApi++
            console.log(`[hero-sync] API ${actress.name}: DB 未収録 → keyword 検索`)
            try {
              const items = await fetchDmmItems({
                keyword: actress.name,
                hits:    5,
                service: 'digital',
                floor:   'videoa',
              })
              const toMs = (d: string) =>
                new Date(d.replace(/\//g, '-').replace(' ', 'T') + '+09:00').getTime()
              const match = items
                .filter(it => it.iteminfo?.actress?.some(a => a.name === actress.name))
                .filter(it => {
                  const n = it.iteminfo?.actress?.length ?? 0
                  return n === 0 || n < 3
                })
                .sort((a, b) => {
                  const ca = a.iteminfo?.actress?.length ?? 0
                  const cb = b.iteminfo?.actress?.length ?? 0
                  if (ca !== cb) return ca - cb  // solo (1) before duo (2)
                  return toMs(b.date ?? '') - toMs(a.date ?? '')
                })[0] ?? null

              if (match) {
                const record = normalizeDmmItem(match, 'videoa')
                await supabase
                  .from('articles')
                  .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })
                latestCid      = match.content_id
                latestTitle    = match.title
                latestImageUrl = record.image_url as string
                console.log(`[hero-sync] API ${actress.name}: 取得 ${latestCid}`)
              } else {
                console.log(`[hero-sync] API ${actress.name}: ヒットなし`)
              }
            } catch (apiErr) {
              console.error(
                `[hero-sync] API ${actress.name} 失敗:`,
                apiErr instanceof Error ? apiErr.message : String(apiErr),
              )
            }
          }

          if (latestCid) {
            // actress.metadata を更新（既存フィールドを保持しつつ hero 情報を追記）
            const prevMeta = ((actress.metadata ?? {}) as Record<string, unknown>)
            // プロフィール画像未設定の女優には最新作パッケージ画像を補完する
            const packageImageUrl =
              !actress.image_url && latestImageUrl
                ? (toHighResPackageUrl(latestImageUrl) ?? latestImageUrl)
                : undefined
            const { error: upErr } = await supabase
              .from('actresses')
              .update({
                ...(packageImageUrl ? { image_url: packageImageUrl } : {}),
                metadata: {
                  ...prevMeta,
                  latest_cid:     latestCid,
                  latest_title:   latestTitle,
                  hero_rank:      actress.heroRank,
                  hero_synced_at: new Date().toISOString(),
                },
              })
              .eq('id', actress.id as string)

            if (!upErr) {
              result.processed++
              if (actress.heroRank === 1 && latestTitle && latestImageUrl) {
                result.top1 = {
                  name:     actress.name,
                  cid:      latestCid,
                  title:    latestTitle,
                  imageUrl: latestImageUrl,
                }
              }
            } else {
              console.error(`[hero-sync] ${actress.name} metadata 更新失敗:`, upErr.message)
              result.errors++
            }
          }
        } catch (err) {
          console.error(
            `[hero-sync] ${actress.name} 例外:`,
            err instanceof Error ? err.message : String(err),
          )
          result.errors++
        }
      }),
    )
  }

  console.log(
    `[hero-sync] 完了 — processed:${result.processed} fromDb:${result.fromDb} fromApi:${result.fromApi} errors:${result.errors}`
  )
  if (result.top1) {
    console.log(
      `[hero-sync] ランク1位: ${result.top1.name} | ${result.top1.cid} | ${result.top1.title.slice(0, 50)} | ${result.top1.imageUrl}`
    )
  }
  return result
}

// ─── Recommended Actress Sync ─────────────────────────────────────────────────

/**
 * FANZA イチオシ女優 30 名の最新作を DB に確保し、
 * actresses.metadata.latest_cid を最新の content_id で更新する。
 *
 * - 高速パス: DB articles テーブルを tags @> [name] で検索（API コールなし）
 * - DB 未収録: DMM keyword 検索でフォールバック（女優レコードも自動生成）
 */
export async function syncRecommendedActresses(): Promise<{
  processed: number
  fromDb:    number
  fromApi:   number
  errors:    number
  sample:    Array<{ name: string; cid: string; title: string }>
}> {
  const supabase = getServiceClient()
  const result: {
    processed: number; fromDb: number; fromApi: number; errors: number
    sample: Array<{ name: string; cid: string; title: string }>
  } = { processed: 0, fromDb: 0, fromApi: 0, errors: 0, sample: [] }

  const CONCURRENT = 10
  const names = [...RECOMMENDED_ACTRESS_NAMES]

  for (let i = 0; i < names.length; i += CONCURRENT) {
    const chunk = names.slice(i, i + CONCURRENT)
    await Promise.allSettled(
      chunk.map(async (actressName) => {
        try {
          let latestCid:      string | null = null
          let latestTitle:    string | null = null
          let latestImageUrl: string | null = null

          // ── 高速パス: DB（単体優先・オムニバス除外）────────────────────────
          const { data: dbRows } = await supabase
            .from('articles')
            .select('external_id, title, image_url, published_at, metadata')
            .eq('is_active', true)
            .contains('tags', [actressName])
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(20)

          const best = pickBestArticle((dbRows ?? []) as ArticleRow[])
          if (best) {
            latestCid      = best.external_id as string
            latestTitle    = best.title       as string
            latestImageUrl = best.image_url   as string
            result.fromDb++
            console.log(`[rec-sync] DB  ${actressName}: ${latestCid}`)
          } else {
            // ── API フォールバック ──────────────────────────────────────────
            result.fromApi++
            console.log(`[rec-sync] API ${actressName}: DB 未収録 → keyword 検索`)
            try {
              const items = await fetchDmmItems({
                keyword: actressName,
                hits:    5,
                service: 'digital',
                floor:   'videoa',
              })
              const toMs2 = (d: string) =>
                new Date(d.replace(/\//g, '-').replace(' ', 'T') + '+09:00').getTime()
              const match = items
                .filter(it => it.iteminfo?.actress?.some(a => a.name === actressName))
                .filter(it => {
                  const n = it.iteminfo?.actress?.length ?? 0
                  return n === 0 || n < 3
                })
                .sort((a, b) => {
                  const ca = a.iteminfo?.actress?.length ?? 0
                  const cb = b.iteminfo?.actress?.length ?? 0
                  if (ca !== cb) return ca - cb
                  return toMs2(b.date ?? '') - toMs2(a.date ?? '')
                })[0] ?? null

              if (match) {
                // 女優レコードを自動生成（未登録の場合）
                const actressMeta = match.iteminfo?.actress?.find(a => a.name === actressName)
                if (actressMeta) {
                  await supabase.from('actresses').upsert(
                    {
                      external_id: `dmm-actress-${actressMeta.id}`,
                      name:        actressName,
                      ruby:        actressMeta.ruby ?? null,
                      is_active:   true,
                      metadata:    { dmm_id: actressMeta.id },
                    },
                    { onConflict: 'external_id', ignoreDuplicates: true },
                  )
                }
                const record = normalizeDmmItem(match, 'videoa')
                await supabase
                  .from('articles')
                  .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })
                latestCid      = match.content_id
                latestTitle    = match.title
                latestImageUrl = record.image_url as string
                console.log(`[rec-sync] API ${actressName}: 取得 ${latestCid}`)
              } else {
                console.log(`[rec-sync] API ${actressName}: ヒットなし`)
              }
            } catch (apiErr) {
              console.error(
                `[rec-sync] API ${actressName} 失敗:`,
                apiErr instanceof Error ? apiErr.message : String(apiErr),
              )
            }
          }

          // ── actress.metadata.latest_cid を更新 ───────────────────────────
          if (latestCid) {
            const { data: actRows } = await supabase
              .from('actresses')
              .select('id, metadata')
              .eq('name', actressName)
              .eq('is_active', true)
              .limit(1)

            if (actRows && actRows.length > 0) {
              const a = actRows[0]
              await supabase
                .from('actresses')
                .update({
                  metadata: {
                    ...((a.metadata as Record<string, unknown>) ?? {}),
                    latest_cid:    latestCid,
                    latest_title:  latestTitle,
                    rec_synced_at: new Date().toISOString(),
                  },
                })
                .eq('id', a.id as string)
            }

            result.processed++
            if (result.sample.length < 5 && latestTitle) {
              result.sample.push({ name: actressName, cid: latestCid, title: latestTitle })
            }
          }
        } catch (err) {
          result.errors++
          console.error(
            `[rec-sync] ${actressName} 例外:`,
            err instanceof Error ? err.message : String(err),
          )
        }
      }),
    )
  }

  console.log(
    `[rec-sync] 完了 — processed:${result.processed} fromDb:${result.fromDb} fromApi:${result.fromApi} errors:${result.errors}`
  )
  return result
}

// ─── Force-override Actress Hero Images ──────────────────────────────────────

/**
 * 指定した女優名 + CID を強制的に actresses.metadata.latest_cid に書き込む。
 * articles に CID が未収録の場合は DMM API から取得して保存する。
 */
export async function forceUpdateActressHeroImages(
  overrides: Array<{ name: string; cid: string }>,
): Promise<{
  results: Array<{
    name:         string
    cid:          string
    articleFound: 'db' | 'api' | 'missing'
    articleSaved: boolean
    actressFound: boolean
    metaUpdated:  boolean
    imageUrl:     string | null
    title:        string | null
    proxyUrl:     string | null
    error?:       string
  }>
}> {
  const supabase = getServiceClient()

  function cidToProductNumber(cid: string): string {
    const m = cid.match(/^(.*?)(\d+)$/)
    return m ? `${m[1].toUpperCase()}-${m[2]}` : cid.toUpperCase()
  }

  type EntryResult = {
    name: string; cid: string
    articleFound: 'db' | 'api' | 'missing'
    articleSaved: boolean; actressFound: boolean; metaUpdated: boolean
    imageUrl: string | null; title: string | null; proxyUrl: string | null
    error?: string
  }
  const results: EntryResult[] = []

  for (const { name, cid } of overrides) {
    const entry: EntryResult = {
      name, cid,
      articleFound: 'missing',
      articleSaved: false, actressFound: false, metaUpdated: false,
      imageUrl: null,
      title:    null,
      proxyUrl: null,
    }

    try {
      // ── Step 1: DB に記事があるか確認 ──────────────────────────────────────
      const { data: existing } = await supabase
        .from('articles')
        .select('external_id, title, image_url')
        .eq('external_id', cid)
        .limit(1)

      if (existing && existing.length > 0) {
        entry.articleFound = 'db'
        entry.title    = existing[0].title     as string
        entry.imageUrl = existing[0].image_url as string | null
        console.log(`[hero-override] DB  ${name} (${cid}): "${entry.title}"`)
      } else {
        // ── Step 2: DMM API から取得 ─────────────────────────────────────────
        const keyword = cidToProductNumber(cid)
        console.log(`[hero-override] API ${name} (${cid}): DB 未収録 → keyword="${keyword}"`)

        const [dRes, mRes] = await Promise.allSettled([
          fetchDmmItems({ keyword, hits: 10, service: 'digital', floor: 'videoa' }),
          fetchDmmItems({ keyword, hits: 10, service: 'mono',    floor: 'dvd'    }),
        ])

        const dItems = (dRes.status === 'fulfilled' ? dRes.value : []).filter(i => i.content_id === cid)
        const mItems = (mRes.status === 'fulfilled' ? mRes.value : []).filter(i => i.content_id === cid)
        console.log(`[hero-override] ${cid}: digital=${dItems.length}件 mono=${mItems.length}件`)

        const best = dItems[0] ?? mItems[0] ?? null
        if (best) {
          const floor  = dItems.includes(best) ? 'videoa' : 'dvd'
          const record = normalizeDmmItem(best, floor)

          const { error: saveErr } = await supabase
            .from('articles')
            .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })

          entry.articleFound = 'api'
          entry.articleSaved = !saveErr
          entry.title        = best.title
          entry.imageUrl     = record.image_url as string | null

          if (saveErr) {
            console.error(`[hero-override] ${cid} 保存失敗: ${saveErr.message}`)
          } else {
            console.log(`[hero-override] API ${name} (${cid}): 保存完了 — "${best.title.slice(0, 45)}"`)
          }
        } else {
          console.warn(`[hero-override] ${name} (${cid}): DMM API でも見つからず`)
        }
      }

      // ── Step 3: actress.metadata.latest_cid を更新 ───────────────────────
      if (entry.title || entry.articleFound !== 'missing') {
        const { data: actRows } = await supabase
          .from('actresses')
          .select('id, metadata')
          .eq('name', name)
          .eq('is_active', true)
          .limit(1)

        if (actRows && actRows.length > 0) {
          entry.actressFound = true
          const a        = actRows[0]
          const prevMeta = ((a.metadata as Record<string, unknown>) ?? {})

          const { error: upErr } = await supabase
            .from('actresses')
            .update({
              metadata: {
                ...prevMeta,
                latest_cid:     cid,
                latest_title:   entry.title,
                hero_synced_at: new Date().toISOString(),
              },
            })
            .eq('id', a.id as string)

          entry.metaUpdated = !upErr
          if (upErr) {
            console.error(`[hero-override] ${name} metadata 更新失敗: ${upErr.message}`)
          } else {
            console.log(`[hero-override] ${name}: metadata.latest_cid ← ${cid}`)
          }
        } else {
          console.warn(`[hero-override] ${name}: actresses テーブルにレコードなし`)
        }
      }

      // ── Step 4: プロキシ経由 URL を組み立ててログ出力 ─────────────────────
      if (entry.imageUrl) {
        entry.proxyUrl = `/api/proxy/image?url=${encodeURIComponent(entry.imageUrl)}`
        console.log(`[hero-override] ${name} image_url  : ${entry.imageUrl}`)
        console.log(`[hero-override] ${name} proxy_url  : ${entry.proxyUrl.slice(0, 100)}`)
      } else {
        console.warn(`[hero-override] ${name}: image_url が null — プロキシ経由表示不可`)
      }
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err)
      console.error(`[hero-override] ${name} (${cid}) 例外:`, entry.error)
    }

    results.push(entry)
  }

  const succeeded = results.filter(r => r.metaUpdated).length
  console.log(`[hero-override] 完了 — ${succeeded}/${overrides.length}名 metadata 更新`)
  return { results }
}

/**
 * 全 DMM 同期完了後の最終ステップとして実行する。
 *
 * Step 1: FORCE_DIGITAL_CIDS（マーキー固定4名）を digital/video pl.jpg で必ず上書き。
 *         sync が ps.jpg や mono パスを書き込んでも、このステップで正しいパスに戻す。
 *
 * Step 2: 残りの FEATURED_CIDS で image_url が壊れている（null / 空 / 'NOW PRINTING'）
 *         ものに CDN URL を補完する。
 */
export async function patchNullFeaturedImageUrls(): Promise<{ patched: number; errors: number }> {
  const supabase = getServiceClient()
  let patched = 0, errors = 0

  // ── Step 1: FORCE_DIGITAL_CIDS を常に上書き ──────────────────────────────
  console.log(`[patch-null-images] Step1 強制上書き: ${[...FORCE_DIGITAL_CIDS].join(', ')}`)
  await Promise.all(
    [...FORCE_DIGITAL_CIDS].map(async (cid) => {
      const imageUrl = cidToCdnUrl(cid, 'pl')
      const { error: upErr } = await supabase
        .from('articles')
        .update({ image_url: imageUrl })
        .eq('external_id', cid)
      if (upErr) {
        console.error(`[patch-null-images] ${cid} 強制上書き失敗:`, upErr.message)
        errors++
      } else {
        console.log(`[patch-null-images] force: ${cid} ← ${imageUrl}`)
        patched++
      }
    })
  )

  // ── Step 2: 残り FEATURED_CIDS の null/空/'NOW PRINTING' を補完 ──────────
  const forcedSet = new Set<string>(FORCE_DIGITAL_CIDS)
  const remainingCids = [...FEATURED_CIDS].filter(c => !forcedSet.has(c))

  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, image_url')
    .in('external_id', remainingCids)

  if (error) {
    console.error('[patch-null-images] Step2 query error:', error.message)
    return { patched, errors: errors + 1 }
  }

  type Row = { id: string; external_id: string; image_url: string | null }
  const badRows = ((data ?? []) as Row[]).filter(r => isBadImageUrl(r.image_url))

  if (badRows.length === 0) {
    console.log('[patch-null-images] Step2: 補完対象なし')
  } else {
    console.log(`[patch-null-images] Step2 補完 (${badRows.length}件): ${badRows.map(r => r.external_id).join(', ')}`)
    for (const row of badRows) {
      const imageUrl = cidToCdnUrl(row.external_id, 'pl')
      const { error: upErr } = await supabase
        .from('articles')
        .update({ image_url: imageUrl })
        .eq('id', row.id)
      if (upErr) {
        console.error(`[patch-null-images] ${row.external_id} 補完失敗:`, upErr.message)
        errors++
      } else {
        console.log(`[patch-null-images] patch: ${row.external_id} ← ${imageUrl}`)
        patched++
      }
    }
  }

  console.log(`[patch-null-images] 完了 — patched:${patched} errors:${errors}`)
  return { patched, errors }
}

/**
 * PINNED_ACTRESS_LATEST_CIDS で定義したマーキー固定女優の metadata.latest_cid を復元する。
 * syncTopActresses の actress upsert が metadata を全上書きするため、
 * 同期が終わった後に必ずこの関数を呼んで latest_cid を保護する。
 */
async function restorePinnedActressLatestCids(): Promise<void> {
  const supabase = getServiceClient()
  await Promise.all(
    Object.entries(PINNED_ACTRESS_LATEST_CIDS).map(async ([name, cid]) => {
      // 現在の metadata を取得してマージ（他フィールドを破壊しない）
      const { data } = await supabase
        .from('actresses')
        .select('metadata')
        .eq('name', name)
        .single()
      const merged = { ...(((data as { metadata: Record<string, unknown> } | null)?.metadata) ?? {}), latest_cid: cid }
      const { error } = await supabase
        .from('actresses')
        .update({ metadata: merged })
        .eq('name', name)
      if (error) {
        console.error(`[restore-latest-cid] ${name} 更新失敗:`, error.message)
      } else {
        console.log(`[restore-latest-cid] ${name} → latest_cid: ${cid}`)
      }
    })
  )
}

// ─── Maker Upcoming Sync ──────────────────────────────────────────────────────

/**
 * 監視メーカー一覧（メーカー ID）。毎日 0:00 JST (15:00 UTC) に巡回。
 * S1, Prestige, SOD Create, V&R, MagicBanana, MOODYZ, WANZ FACTORY,
 * E-BODY, Ksommelier, ALICE JAPAN, GIGA
 */
const MONITORED_MAKER_IDS = [3152, 1509, 1219, 6329, 40488, 4641, 6304, 2661, 45276, 5032, 4469]

/**
 * 監視メーカーの新作・予約作を DB に取り込み、未登録女優・SNS 未設定女優を報告する。
 * digital/videoa と mono/dvd の両方を巡回して重複排除する。
 */
export async function syncMakerUpcoming(): Promise<{
  inserted:       number
  errors:         number
  newActresses:   string[]
  noSnsActresses: string[]
}> {
  const supabase = getServiceClient()
  let inserted = 0, errors = 0

  const allItems     = new Map<string, DmmItem>()
  const actressNames = new Map<number, string>()

  // ── Step 1: 全メーカー × 両フロアを取得（重複は content_id で排除）────────
  for (const makerId of MONITORED_MAKER_IDS) {
    for (const [service, floor] of [['digital', 'videoa'], ['mono', 'dvd']] as [string, string][]) {
      try {
        const items = await fetchDmmItems({
          article:    'maker',
          article_id: String(makerId),
          hits:       100,
          sort:       'date',
          service,
          floor,
        })
        for (const item of items) {
          if (!allItems.has(item.content_id)) allItems.set(item.content_id, item)
          for (const a of item.iteminfo?.actress ?? []) {
            if (!actressNames.has(a.id)) actressNames.set(a.id, a.name)
          }
        }
        console.log(`[maker-sync] maker=${makerId} ${service}/${floor}: ${items.length}件`)
      } catch (err) {
        console.error(
          `[maker-sync] maker=${makerId} ${service}/${floor} 失敗:`,
          err instanceof Error ? err.message : String(err),
        )
        errors++
      }
    }
  }

  // ── Step 2: 記事を一括 upsert ────────────────────────────────────────────
  for (const item of allItems.values()) {
    if (isDmmItemExcluded(item)) continue
    const record = normalizeDmmItem(item, 'videoa')
    const { error } = await supabase
      .from('articles')
      .upsert(record, { onConflict: 'external_id', ignoreDuplicates: false })
    if (error) {
      console.error(`[maker-sync] upsert failed ${item.content_id}:`, error.message)
      errors++
    } else {
      inserted++
    }
  }

  // ── Step 3: 女優の登録状況を確認 ─────────────────────────────────────────
  const externalIds = [...actressNames.keys()].map(id => `dmm-actress-${id}`)
  const { data: existingRows } = await supabase
    .from('actresses')
    .select('external_id, twitter_screen_name')
    .in('external_id', externalIds)

  const existingMap = new Map<string, string | null>()
  for (const row of existingRows ?? []) {
    existingMap.set(
      row.external_id as string,
      (row.twitter_screen_name as string | null) ?? null,
    )
  }

  const newActresses:   string[] = []
  const noSnsActresses: string[] = []

  for (const [id, name] of actressNames) {
    const extId = `dmm-actress-${id}`
    if (!existingMap.has(extId)) {
      newActresses.push(name)
    } else if (!existingMap.get(extId)) {
      noSnsActresses.push(name)
    }
  }

  console.log(
    `[maker-sync] 完了 — items:${allItems.size} inserted:${inserted} errors:${errors}`,
  )
  console.log(`[maker-sync] 未登録女優 (${newActresses.length}名):`, newActresses)
  console.log(`[maker-sync] SNS未設定女優 (${noSnsActresses.length}名):`, noSnsActresses)

  return { inserted, errors, newActresses, noSnsActresses }
}

export async function syncAllSources(): Promise<PipelineResult[]> {
  const hasDmmKey = !!(process.env.DMM_API_ID && process.env.AFFILIATE_ID)

  if (hasDmmKey) {
    // フル同期: 人気女優ランク + 全方位日付順 + 特集CID 補完
    const main = await syncTopActresses()
    // image_url 強制上書き + 壊れた URL の補完
    const patch = await patchNullFeaturedImageUrls()
    if (patch.patched > 0) {
      console.log(`[syncAllSources] image_url 補完: ${patch.patched}件`)
    }
    // syncTopActresses の metadata 上書きで消えた hero_rank / latest_cid を再設定
    await syncActressHeroImages()
    // マーキー固定女優の latest_cid を確実に保護（syncActressHeroImages の上書き後に実行）
    await restorePinnedActressLatestCids()
    return [main]
  }

  // DMM APIキー未設定 — モックデータでシード（開発用フォールバック）
  return [await seedWithMockData()]
}
