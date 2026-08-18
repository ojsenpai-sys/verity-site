// src/lib/fastestReleasesSelection.mjs — 「最新作最速更新情報」の配信済み最新作選定ロジック(pure)。
//
// 「最新作」の正本は published_at（DMM配信日）— fetched_at(DB取込日時)ではない。
// 予約商品(published_at が未来)は主要メーカーで大量に早期登録されるため、
// fetched_at 降順のままだと「直近に取り込んだだけの未来予約作」が「実際に配信中の
// 最新作」より上位に来てしまう(Phase F調査で確認)。published_at は DMM の date
// フィールドを maker-sync 側で JST(+09:00) 解釈のうえ UTC の timestamptz へ正しく
// 変換して保存済みのため、ここでの比較は絶対時刻同士の比較であり、
// 追加の JST/UTC オフセット計算は不要（手書きの +9h/-9h は行わない）。
// PostgREST は timestamptz を常に UTC・固定書式の ISO8601(+00:00終端)で返すため、
// 文字列比較がそのまま時系列比較として成立する(小数秒桁数が異なっても prefix 関係が保たれる)。
//
// pure function — 副作用なし・DB/API呼び出しなし。node:test で直接テスト可能。

/**
 * published_at が null、または現在時刻より未来(＝配信前の予約商品)なら false。
 * @param {string | null} publishedAt
 * @param {string} nowIso
 * @returns {boolean}
 */
export function isReleasedByNow(publishedAt, nowIso) {
  if (!publishedAt) return false
  return publishedAt <= nowIso
}

/**
 * published_at 降順、同値は fetched_at 降順でタイブレーク。
 * @param {{ published_at: string | null, fetched_at: string }} a
 * @param {{ published_at: string | null, fetched_at: string }} b
 * @returns {number}
 */
export function compareByPublishedThenFetched(a, b) {
  const pa = a.published_at ?? ''
  const pb = b.published_at ?? ''
  if (pa !== pb) return pa < pb ? 1 : -1
  return a.fetched_at < b.fetched_at ? 1 : a.fetched_at > b.fetched_at ? -1 : 0
}

/**
 * 配信済み(published_at<=now)のみを残し、published_at→fetched_at降順で並べ替える。
 * @template {{ published_at: string | null, fetched_at: string }} T
 * @param {T[]} rows
 * @param {string} nowIso
 * @returns {T[]}
 */
export function selectReleasedRows(rows, nowIso) {
  return rows
    .filter((r) => isReleasedByNow(r.published_at, nowIso))
    .sort(compareByPublishedThenFetched)
}
