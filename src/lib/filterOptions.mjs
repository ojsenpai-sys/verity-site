// src/lib/filterOptions.mjs — トップページ getFilterOptions の集計ロジック(pure)。
//
// Phase 1A: getFilterOptions は unstable_cache で15分共有キャッシュする。
//   - 4クエリすべて成功 → 完全な結果を返す(=キャッシュされる)。
//   - 一部失敗 → 取得できたデータで従来どおり集計した部分結果を PartialFilterOptionsError に
//     載せて throw する(unstable_cache は throw した結果を保存しないため、部分結果はキャッシュ
//     されない)。呼び出し側は takePartialFilterOptions() で取り出し、そのリクエストだけ
//     部分結果を表示する(従来の「失敗したクエリ分だけ欠ける」表示と同じ)。
// 例外の判定は instanceof ではなく専用プロパティで行う(キャッシュ層を経由しても判定が崩れないように)。
//
// pure — DB/API呼び出しなし。node:test で直接テスト可能。

const PARTIAL_MARKER = '__verityPartialFilterOptions'

/** @typedef {{ data: any[] | null, error: unknown }} QueryResult */

/**
 * 4クエリの結果から FilterOptions を組み立てる(従来の getFilterOptions 本体と同一ロジック)。
 * 失敗したクエリは data=null として扱う(従来どおりその項目だけ空になる)。
 * @param {{ cat: QueryResult, src: QueryResult, tag: QueryResult, act: QueryResult }} r
 * @returns {{ options: { categories: string[], sources: string[], tags: string[], actresses: any[] }, failed: string[] }}
 */
export function assembleFilterOptions(r) {
  const failed = Object.entries(r).filter(([, v]) => v.error).map(([k]) => k)
  const rows = (k) => (r[k].error ? null : r[k].data)

  const actresses = [...(rows('act') ?? [])].sort((a, b) => {
    const ra = a.metadata?.monthly_rank ?? 9999
    const rb = b.metadata?.monthly_rank ?? 9999
    return ra - rb
  })
  const actressNames = new Set(actresses.map((a) => a.name))

  const categories = [...new Set(rows('cat')?.map((x) => x.category).filter(Boolean))].sort()
  const sources    = [...new Set(rows('src')?.map((x) => x.source).filter(Boolean))].sort()

  // Count tag frequency, exclude actress names
  const tagCounts = new Map()
  for (const row of rows('tag') ?? []) {
    for (const t of row.tags ?? []) {
      if (t && !actressNames.has(t)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)

  return { options: { categories, sources, tags, actresses }, failed }
}

/**
 * キャッシュ対象関数の本体で使う: 全成功なら options を返し、部分失敗なら部分結果付きで throw する。
 * @param {Parameters<typeof assembleFilterOptions>[0]} r
 */
export function filterOptionsOrThrowPartial(r) {
  const { options, failed } = assembleFilterOptions(r)
  if (failed.length === 0) return options
  const err = new Error(`getFilterOptions: partial failure (${failed.join(',')})`)
  Object.defineProperty(err, PARTIAL_MARKER, { value: { options, failed }, enumerable: false })
  throw err
}

/**
 * catch 側で使う: 部分失敗エラーなら { options, failed } を返し、それ以外は null。
 * @param {unknown} err
 * @returns {{ options: ReturnType<typeof assembleFilterOptions>['options'], failed: string[] } | null}
 */
export function takePartialFilterOptions(err) {
  if (err && typeof err === 'object' && PARTIAL_MARKER in err) return /** @type {any} */ (err)[PARTIAL_MARKER]
  return null
}
