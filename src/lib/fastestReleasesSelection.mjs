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
//         videoa/dvd間のCID変換による同一作品マージは行わない
//         (product_id==content_id、number=nullでDMM側に信頼できる同一作品キーが
//          存在しないため。Phase F-2調査で確認)。後日videoa版がDBへ入れば、
//          その時点のMAX(fetched_at)がvideoaの新しいbatchになり自然にvideoaへ
//          切り替わる(明示的な行マージ処理は不要)。floorが排他選択される結果、
//          videoa行とdvd行が同時に候補へ残ることはない
//          (=videoa/dvd間の重複SKUはこの時点で構造的に発生しない)。
//
//   同一作品SKU dedupe(Phase F-3): 上記floor決定の"後"、同一floor内で
//         本編+特典版(BOD等)のような派生CIDが並ぶケースを1件にまとめる。
//         実データ確認済みの命名規則(例: mngs00082 ⇔ mngs082 ⇔ mngs082bod は
//         いずれも同一作品)に基づき、
//           1. content_id を「英字プレフィックス + 数値」に正規化した
//              canonicalCidBase が一致する行をグループ化
//              (ゼロ埋めの有無・末尾の英字サフィックス(bod等)を無視して比較。
//               末尾が数値で終わらないCIDは正規化できないため単独グループとして扱う
//               = 誤って他行と結合されない安全側フォールバック)
//           2. グループ内の全titleが、その中で最も短いtitleを共通の接頭辞として
//              持つ場合のみ「同一作品の派生SKU」と断定する(特典版は本編titleの
//              末尾に「 （BOD）」等が追記される形で観測されているため)。
//              1件でも接頭辞関係が崩れる場合はグループ全体をdedupeしない
//              (false positiveより重複が残る方を優先)。
//           3. 断定できたグループは最も短いtitleの行(=本編)を代表として残す。
//              同着の場合はcontent_id昇順で安定的にタイブレークする
//              (意味的な優劣判定はしない)。
//         dedupeは floor決定後・published_at整理"前"に適用する
//         (maker latest detection → 候補取得 → floor決定 → dedupe → published_at整理 → 表示)。
//         これにより「メーカーの最新batch自体」は変わらず、表示候補の重複だけが
//         整理される。dedupeで件数が減っても、同一batch内の残り候補から
//         published_at整理が自動的に繰り上げるため、表示件数は
//         (候補が尽きない限り)維持される。
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

// ── 同一作品SKU dedupe(Phase F-3) ────────────────────────────────────────────

/**
 * content_id を「英字プレフィックス + 数値」に正規化する。
 * ゼロ埋め(mngs00082→mngs82)・末尾英字サフィックス(mngs082bod→mngs82)を無視する。
 * 末尾が数値で終わらない/パターンに一致しないCIDはそのまま(小文字化のみ)返す
 * — 他の行と偶然一致しない限り単独グループになる安全側フォールバック。
 * @param {string} cid
 * @returns {string}
 */
export function canonicalCidBase(cid) {
  const m = /^([a-z]+)(\d+)[a-z]*$/i.exec(cid ?? '')
  if (!m) return (cid ?? '').toLowerCase()
  return `${m[1].toLowerCase()}${parseInt(m[2], 10)}`
}

/**
 * グループ内の全titleが、最も短いtitleを共通の接頭辞として持つか。
 * 特典版(BOD等)は本編titleの末尾に追記される形で観測されているため、
 * 「最短title→他の全titleの接頭辞」であれば同一作品の派生SKUと断定してよい。
 * 1件でも接頭辞関係が崩れる、またはtitleが欠落している行があれば false
 * (=安全側でdedupeしない)。
 * @param {(string | null | undefined)[]} titles
 * @returns {boolean}
 */
export function isSameWorkTitleGroup(titles) {
  if (titles.some((t) => !t)) return false
  const shortest = titles.reduce((a, b) => (a.length <= b.length ? a : b))
  if (shortest.length === 0) return false
  return titles.every((t) => t.startsWith(shortest))
}

/** 代表SKU選定: 最短title(=本編)を優先。同着はcontent_id昇順で安定タイブレーク。 */
function pickRepresentative(rows) {
  return [...rows].sort((a, b) => {
    const la = (a.title ?? '').length
    const lb = (b.title ?? '').length
    if (la !== lb) return la - lb
    return a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0
  })[0]
}

/**
 * 同一floor内の候補行から、同一作品と断定できる派生SKUグループを1件(代表)にまとめる。
 * 断定できないグループは全件そのまま残す(false positiveより重複が残る方を優先)。
 * @template {{ external_id: string, title: string | null }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function dedupeSameWork(rows) {
  /** @type {Map<string, T[]>} */
  const groups = new Map()
  for (const r of rows) {
    const key = canonicalCidBase(r.external_id)
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  const result = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0])
      continue
    }
    if (isSameWorkTitleGroup(group.map((r) => r.title))) {
      result.push(pickRepresentative(group))
    } else {
      result.push(...group)
    }
  }
  return result
}

/**
 * 最新検知batch(同一fetched_atの行群)から、表示floorを決定し、同一作品の
 * 派生SKUを1件にまとめたうえで、「現在に近い未来作品を優先し、足りなければ
 * 配信済みの新しい順で補完」して最大 limit 件を返す。
 *
 * パイプライン: floor決定 → 同一作品dedupe → published_at整理・limit。
 * dedupeで件数が減っても、同一batch内の残り候補からpublished_at整理が
 * 自動的に繰り上げるため表示件数は(候補が尽きない限り)維持される。
 * @template {FastestBatchRow & { external_id: string, title: string | null }} T
 * @param {T[]} batchRows
 * @param {string} nowIso
 * @param {number} limit
 * @returns {T[]}
 */
export function selectFastestCards(batchRows, nowIso, limit) {
  const floor = pickDisplayFloor(batchRows)
  if (!floor) return []

  const candidates = batchRows.filter((r) => r.floor === floor && r.published_at != null)
  const deduped = dedupeSameWork(candidates)
  const future = deduped.filter((r) => isFuturePublished(r.published_at, nowIso)).sort(compareFutureAsc)
  const past = deduped.filter((r) => !isFuturePublished(r.published_at, nowIso)).sort(comparePastDesc)

  return [...future, ...past].slice(0, limit)
}
