// src/lib/fastestReleasesSelection.mjs — 「最新作最速更新情報」の配信済み最新作選定ロジック(pure)。
//
// Phase F-2: 「検知」と「表示」を分離する設計。
//
//   検知: メーカーごとに floor∈{videoa, dvd} を合算した MAX(fetched_at) を
//         「最新検知batch」とみなし、その時刻と完全一致する行の集合を候補にする。
//         (fetched_atはmaker-sync側でINSERT時に一度だけ確定し、以降のcronで
//          再取得されても更新されない — 同一batch内の行は同一トランザクションで
//          挿入されたためfetched_atが完全一致する。Phase F-2調査で実データ確認済み)
//         同一batchの全行を「その日に解禁された新作」と断定はしない
//         (maker-syncのhits=100固定ウィンドウの影響で、過去の取得漏れ商品が
//          同一batchでまとめて初取得される可能性があるため)。
//
//   表示floor決定: batch内にvideoa行が1件以上あればvideoaのみを採用。
//         videoaが0件のときのみdvd行をフォールバックとして採用する。
//         CID文字列変換によるvideoa/dvdの同一作品マージは行わない
//         (product_id==content_id、number=nullでDMM側に信頼できる同一作品キーが
//          存在しないため。Phase F-2調査で確認)。後日videoa版がDBへ入れば、
//          その時点のMAX(fetched_at)がvideoaの新しいbatchになり自然にvideoaへ
//          切り替わる(明示的な行マージ処理は不要)。
//
//   batch内の表示候補整理: published_at は「フィルタ」ではなく「整理」に使う。
//         1. published_at >= now(未来・配信前) → published_at 昇順(現在に近い順)
//         2. 1だけで limit に満たない場合、published_at < now(配信済み) →
//            published_at 降順(配信済みの新しい順)で補完
//         3. published_at が null の行は除外
//            (2026-08-18時点、対象8メーカーの実データで null は0件のため
//             安全側の「除外」を採用。将来 null が発生した場合も、日付不明の
//             カードを「現在に近い順」の並びに混在させると位置づけが不明瞭に
//             なるため、末尾挿入より除外の方が誤解を招かない)
//
// pure function — 副作用なし・DB/API呼び出しなし。node:test で直接テスト可能。

/**
 * @typedef {{ floor: string | null, published_at: string | null, fetched_at: string }} FastestBatchRow
 */

/** batch内にvideoa行があればvideoa、なければdvdがあればdvd、どちらも無ければnull。 */
export function pickDisplayFloor(rows) {
  if (rows.some((r) => r.floor === 'videoa')) return 'videoa'
  if (rows.some((r) => r.floor === 'dvd')) return 'dvd'
  return null
}

/** published_at が現在時刻以降(未来・配信前)か。 */
export function isFuturePublished(publishedAt, nowIso) {
  return publishedAt != null && publishedAt >= nowIso
}

/** published_at 昇順(同値は fetched_at 降順でタイブレーク)。未来枠(現在に近い順)用。 */
function compareFutureAsc(a, b) {
  if (a.published_at !== b.published_at) return a.published_at < b.published_at ? -1 : 1
  return a.fetched_at < b.fetched_at ? 1 : a.fetched_at > b.fetched_at ? -1 : 0
}

/** published_at 降順(同値は fetched_at 降順でタイブレーク)。配信済み枠(新しい順)用。 */
function comparePastDesc(a, b) {
  if (a.published_at !== b.published_at) return a.published_at < b.published_at ? 1 : -1
  return a.fetched_at < b.fetched_at ? 1 : a.fetched_at > b.fetched_at ? -1 : 0
}

/**
 * 最新検知batch(同一fetched_atの行群)から、表示floorを決定したうえで
 * 「現在に近い未来作品を優先し、足りなければ配信済みの新しい順で補完」して
 * 最大 limit 件を返す。
 * @template {FastestBatchRow} T
 * @param {T[]} batchRows
 * @param {string} nowIso
 * @param {number} limit
 * @returns {T[]}
 */
export function selectFastestCards(batchRows, nowIso, limit) {
  const floor = pickDisplayFloor(batchRows)
  if (!floor) return []

  const candidates = batchRows.filter((r) => r.floor === floor && r.published_at != null)
  const future = candidates.filter((r) => isFuturePublished(r.published_at, nowIso)).sort(compareFutureAsc)
  const past = candidates.filter((r) => !isFuturePublished(r.published_at, nowIso)).sort(comparePastDesc)

  return [...future, ...past].slice(0, limit)
}
