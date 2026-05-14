// DMM Affiliate API v3
// Docs: https://affiliate.dmm.com/api/v3/

const ITEM_LIST_BASE   = 'https://api.dmm.com/affiliate/v3/ItemList'
const ACTRESS_SEARCH_BASE = 'https://api.dmm.com/affiliate/v3/ActressSearch'

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getCredentials() {
  const apiId = process.env.DMM_API_ID
  const affiliateId = process.env.AFFILIATE_ID
  if (!apiId || !affiliateId) {
    throw new Error('[dmm] 環境変数 DMM_API_ID または AFFILIATE_ID が未設定です')
  }
  return { apiId, affiliateId }
}

/** クレデンシャルを *** にマスクした安全なログ用 URL を生成 */
function safeQs(params: Record<string, string>): string {
  return new URLSearchParams({ ...params, api_id: '***', affiliate_id: '***' }).toString()
}

async function callApi<T>(url: string, qs: URLSearchParams, label: string): Promise<T> {
  const safeUrl = `${url}?${safeQs(Object.fromEntries(qs))}`
  console.log(`[dmm:${label}] GET ${safeUrl}`)

  const res = await fetch(`${url}?${qs}`, { cache: 'no-store' })
  const text = await res.text()

  if (!res.ok) {
    console.error(`[dmm:${label}] HTTP ${res.status} — URL: ${safeUrl}`)
    console.error(`[dmm:${label}] body: ${text.slice(0, 800)}`)

    // DMM レスポンスを JSON でパースしてフィールド別エラーを抽出する
    try {
      const errBody = JSON.parse(text) as {
        result?: { message?: string; errors?: Record<string, string> }
      }
      const fields = errBody.result?.errors ?? {}
      const detail = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(', ')

      if ('api_id' in fields) {
        throw new Error(
          `[dmm:${label}] api_id 認証エラー (${res.status}): ${detail}\n` +
          '→ affiliate.dmm.com の Webサービス設定で DMM_API_ID が有効か確認してください。'
        )
      }
      throw new Error(`[dmm:${label}] HTTP ${res.status}: ${errBody.result?.message ?? (detail || text.slice(0, 200))}`)
    } catch (inner) {
      // inner が自分でthrowしたものならそのまま再投げ
      if (inner instanceof Error && inner.message.startsWith('[dmm:')) throw inner
      throw new Error(`[dmm:${label}] HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`[dmm:${label}] JSONパース失敗: ${text.slice(0, 200)}`)
  }
}

// ─── ItemList ─────────────────────────────────────────────────────────────────

type DmmInfoEntry = { id: number; name: string; ruby?: string }

export type DmmItem = {
  content_id: string
  product_id: string
  title: string
  URL: string
  affiliateURL: string
  imageURL: { list: string; small: string; large: string }
  sampleMovieURL?: {
    size_476_306?: string
    size_560_360?: string
    size_644_414?: string
    size_720_480?: string
    pc_flag?: number
    sp_flag?: number
  }
  date: string
  volume?: string
  number?: string
  review?: { count: number; average: string }
  prices?: { price: string; list_price?: string }
  iteminfo?: {
    genre?: DmmInfoEntry[]
    actress?: DmmInfoEntry[]
    maker?: DmmInfoEntry[]
    label?: DmmInfoEntry[]
    series?: DmmInfoEntry[]
    director?: DmmInfoEntry[]
  }
}

type ItemListResponse = {
  result: {
    status: number
    message?: string
    result_count?: number
    total_count?: number
    first_position?: number
    items?: DmmItem[]
  }
}

export type FetchDmmParams = {
  hits?: number
  offset?: number
  sort?: 'date' | 'rank' | 'review' | 'price' | '-price' | 'match'
  /** DMM フロア (videoa / doujin / anime / etc.)  複数ブランド対応用 */
  floor?: string
  service?: string
  /** キーワード検索。指定すると sort は自動で 'match' になる（API 制約） */
  keyword?: string
  /** article 種別フィルタ (例: 'maker', 'actress', 'series') */
  article?: string
  /** article に対応する ID */
  article_id?: string
}

export async function fetchDmmItems(params: FetchDmmParams = {}): Promise<DmmItem[]> {
  const { apiId, affiliateId } = getCredentials()

  // keyword 指定時は sort=match が必須。それ以外はデフォルト sort=date。
  const kw = params.keyword?.trim()
  if (params.keyword !== undefined && !kw) {
    console.log('[dmm:item] keyword が空のためスキップ:', JSON.stringify(params))
    return []
  }

  // keyword 指定時も sort=date を使う（sort 省略は 400、sort=match/rank も 400）。
  // keyword なし: 明示 sort または 'date'。
  const sortValue = params.sort ?? 'date'

  console.log('[dmm:item] request →', JSON.stringify({
    service: params.service ?? 'digital',
    floor:   params.floor   ?? 'videoa',
    ...(sortValue ? { sort: sortValue } : { sort: '(omitted)' }),
    hits:    params.hits   ?? 50,
    offset:  params.offset ?? 1,
    ...(kw ? { keyword: kw } : {}),
  }))

  const qs = new URLSearchParams({
    api_id:       apiId,
    affiliate_id: affiliateId,
    site:         'FANZA',
    service:      params.service ?? 'digital',
    floor:        params.floor   ?? 'videoa',
    hits:         String(params.hits   ?? 50),
    offset:       String(params.offset ?? 1),
    output:       'json',
  })

  // sort を省略すると API デフォルトが適用される（keyword 指定時は省略が最も安全）
  if (sortValue)          qs.set('sort',       sortValue)
  if (kw)                 qs.set('keyword',    kw)
  if (params.article)     qs.set('article',    params.article)
  if (params.article_id)  qs.set('article_id', params.article_id)

  const json = await callApi<ItemListResponse>(ITEM_LIST_BASE, qs, 'item')
  const { result } = json

  if (result.status !== 200) {
    console.log('[dmm:item] エラーレスポンス全文:', JSON.stringify(json, null, 2))
    const msg = result.message ?? JSON.stringify(result)
    switch (result.status) {
      case 400: throw new Error(`[dmm:item] パラメータ不正 (400): ${msg}`)
      case 403: throw new Error(
        `[dmm:item] 認証エラー (403): ${msg}\n` +
        '→ DMM_API_ID または AFFILIATE_ID が正しくありません。\n' +
        '→ FANZA アフィリエイト登録が完了しているか確認してください。'
      )
      case 404: throw new Error(`[dmm:item] 結果なし (404): ${msg}`)
      default:  throw new Error(`[dmm:item] APIエラー (${result.status}): ${msg}`)
    }
  }

  const items = result.items ?? []
  console.log(`[dmm:item] ${items.length}件取得 (total: ${result.total_count ?? '?'})`)
  return items
}

// ─── ActressSearch ────────────────────────────────────────────────────────────

// ActressSearch の sort=popular は DMM API v3 では非対応 (HTTP 400)。
// 代わりに ItemList sort=rank から女優を導出する（pipeline.ts 参照）。

type DmmActressResult = {
  id: string
  name: string
  ruby?: string
  imageURL?: { small: string; large: string }
}

type ActressSearchResponse = {
  result: {
    status: number
    result_count?: number
    items?: DmmActressResult[]
  }
}

/**
 * 女優 ID のリストを ActressSearch API で検索し id → image_url の Map を返す。
 *
 * 戦略:
 *   1. カンマ区切りバッチ（1 リクエスト）を試みる
 *   2. バッチが 0 件なら個別リクエストにフォールバック（上位 30 名まで）
 *
 * DMM CDN はホットリンク保護があるため、取得した URL は next/image 経由で
 * サーバープロキシして表示すること（直接 <img src> は弾かれる）。
 */
export async function fetchActressImages(actressIds: number[]): Promise<Map<number, string>> {
  if (actressIds.length === 0) return new Map()

  const { apiId, affiliateId } = getCredentials()
  const imageMap = new Map<number, string>()

  // ActressSearch は comma-separated actress_id を受け付けないため個別リクエストのみ使用
  // 5並列で全IDを順次処理する
  const CONCURRENCY = 5
  console.log(`[dmm:actress] ${actressIds.length}名を個別リクエスト (${CONCURRENCY}並列) で取得`)

  for (let i = 0; i < actressIds.length; i += CONCURRENCY) {
    const batch = actressIds.slice(i, i + CONCURRENCY)
    await Promise.allSettled(batch.map(async (id) => {
      const qs = new URLSearchParams({
        api_id:       apiId,
        affiliate_id: affiliateId,
        site:         'FANZA',
        output:       'json',
        hits:         '1',
        actress_id:   String(id),
      })
      try {
        const json = await callApi<ActressSearchResponse>(ACTRESS_SEARCH_BASE, qs, 'actress')
        if (json.result.status === 200 && json.result.items?.length) {
          const item = json.result.items[0]
          const url = item.imageURL?.large ?? item.imageURL?.small ?? null
          if (url) imageMap.set(id, url)
        }
      } catch {
        // ベストエフォート
      }
    }))
  }

  console.log(`[dmm:actress] 完了: ${imageMap.size}/${actressIds.length}件取得`)
  if (imageMap.size > 0) {
    console.log('[dmm:actress] サンプル URL:', imageMap.values().next().value)
  }
  return imageMap
}

/**
 * 女優名（文字列）で ActressSearch を実行し、name → image_url の Map を返す。
 * デジタル版と通販版で actress_id が異なる場合でも名前から画像を取得できる。
 * 上限 `maxCalls` 件まで（デフォルト 20）個別リクエストを行う。
 */
export async function fetchActressImagesByName(
  names: string[],
  maxCalls = 20,
): Promise<Map<string, string>> {
  if (names.length === 0) return new Map()
  const { apiId, affiliateId } = getCredentials()
  const imageMap = new Map<string, string>()

  for (const name of names.slice(0, maxCalls)) {
    const qs = new URLSearchParams({
      api_id:       apiId,
      affiliate_id: affiliateId,
      site:         'FANZA',
      output:       'json',
      hits:         '5',    // 候補を複数取り、名前完全一致を優先
      keyword:      name,
    })
    try {
      const json = await callApi<ActressSearchResponse>(ACTRESS_SEARCH_BASE, qs, 'actress-name')
      if (json.result.status === 200 && json.result.items?.length) {
        const exact = json.result.items.find(item => item.name === name)
        const hit   = exact ?? json.result.items[0]
        const url   = hit.imageURL?.large ?? hit.imageURL?.small ?? null
        if (url) {
          imageMap.set(name, url)
          console.log(`[dmm:actress-name] ${name}: ${url.slice(-30)}`)
        } else {
          console.log(`[dmm:actress-name] ${name}: API 応答あり、画像なし`)
        }
      } else {
        console.log(`[dmm:actress-name] ${name}: 該当女優なし (status=${json.result.status})`)
      }
    } catch (err) {
      console.log(`[dmm:actress-name] ${name}: 取得失敗 —`, err instanceof Error ? err.message : String(err))
    }
  }

  console.log(`[dmm:actress-name] 名前検索完了: ${imageMap.size}/${names.length}件`)
  return imageMap
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

const EXCLUDED_GENRES = new Set(['イメージビデオ'])

/** 同期対象から除外すべき作品かどうかを判定する（イメージビデオ等）。 */
export function isDmmItemExcluded(item: DmmItem): boolean {
  return item.iteminfo?.genre?.some(g => EXCLUDED_GENRES.has(g.name)) ?? false
}

/** DMM item → articles テーブルのスキーマにマッピング */
export function normalizeDmmItem(item: DmmItem, floor = 'videoa'): Record<string, unknown> {
  const genres    = item.iteminfo?.genre?.map(g => g.name)   ?? []
  const actresses = item.iteminfo?.actress?.map(a => a.name) ?? []
  const tags      = [...actresses, ...genres]

  // ItemList に本文はないのでメタデータから summary を組み立てる
  const makerName  = item.iteminfo?.maker?.[0]?.name  ?? ''
  const labelName  = item.iteminfo?.label?.[0]?.name  ?? ''
  const seriesName = item.iteminfo?.series?.[0]?.name ?? ''
  const summary = [
    actresses.length ? actresses.join('・') : null,
    makerName  || null,
    labelName  || null,
    seriesName ? `シリーズ: ${seriesName}` : null,
  ].filter(Boolean).join(' / ') || null

  // DMM 日付 "2024/01/15 00:00:00" (JST) → ISO 8601 UTC
  const publishedAt = item.date
    ? new Date(item.date.replace(/\//g, '-').replace(' ', 'T') + '+09:00').toISOString()
    : null

  return {
    external_id:  item.content_id,
    title:        item.title,
    slug:         buildSlug(item.title, item.content_id),
    source:       'dmm',
    category:     item.iteminfo?.genre?.[0]?.name ?? null,
    tags:         tags.length > 0 ? tags : null,
    summary,
    content:      null,
    // DMM API が返す canonical URL (pl.jpg) をそのまま保存する。
    // プロキシが jp.jpg へのアップグレードを透過的に試み、存在しない場合は pl.jpg を返す。
    image_url:    item.imageURL?.large ?? item.imageURL?.small ?? null,
    published_at: publishedAt,
    is_active:    true,
    metadata: {
      floor,                          // マルチブランド識別用
      product_id:    item.product_id,
      number:        item.number     ?? null,
      volume:        item.volume     ?? null,
      url:           item.URL,
      affiliate_url:    item.affiliateURL,
      sample_movie_url: item.sampleMovieURL?.size_720_480
                        ?? item.sampleMovieURL?.size_644_414
                        ?? item.sampleMovieURL?.size_560_360
                        ?? item.sampleMovieURL?.size_476_306
                        ?? null,
      price:         item.prices?.price      ?? null,
      list_price:    item.prices?.list_price ?? null,
      review:        item.review             ?? null,
      actress:       item.iteminfo?.actress  ?? [],
      maker:         item.iteminfo?.maker    ?? [],
      label:         item.iteminfo?.label    ?? [],
      series:        item.iteminfo?.series   ?? [],
      director:      item.iteminfo?.director ?? [],
    },
  }
}

/**
 * DmmItem[] から actresses テーブル用レコードを組み立てる。
 * imageMap は fetchActressImages() の結果（なければ空 Map でよい）。
 */
export function buildActressRecords(
  items: DmmItem[],
  imageMap: Map<number, string>,
): Record<string, unknown>[] {
  const seen = new Map<number, Record<string, unknown>>()

  for (const item of items) {
    for (const a of item.iteminfo?.actress ?? []) {
      if (seen.has(a.id)) continue
      seen.set(a.id, {
        external_id: `dmm-actress-${a.id}`,
        name:        a.name,
        ruby:        a.ruby ?? null,
        image_url:   imageMap.get(a.id) ?? null,
        is_active:   true,
        metadata: { dmm_id: a.id },
      })
    }
  }

  return Array.from(seen.values())
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildSlug(title: string, contentId: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  // フル content_id を使うことで slug の一意性を保証（8文字切り捨てだと衝突が発生）
  return `${base}-${contentId}`
}
