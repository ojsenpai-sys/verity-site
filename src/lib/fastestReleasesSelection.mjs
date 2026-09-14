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
 * 「現在に近い未来作品を優先し、足りなければ配信済みの新しい順で補完」する
 * 表示順に candidates を並べ替える(published_at整理そのもの)。
 * selectFastestCards / selectFastestCardsVariable の共通ロジック。
 * @template {{ published_at: string | null }} T
 * @param {T[]} candidates
 * @param {string} nowIso
 * @returns {T[]}
 */
export function orderByPublishedAt(candidates, nowIso) {
  const future = candidates.filter((r) => isFuturePublished(r.published_at, nowIso)).sort(compareFutureAsc)
  const past = candidates.filter((r) => !isFuturePublished(r.published_at, nowIso)).sort(comparePastDesc)
  return [...future, ...past]
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
  return orderByPublishedAt(deduped, nowIso).slice(0, limit)
}

/**
 * Phase 1(最新作最速更新情報 Refresh): 1メーカー分の全候補行(fetched_at DESCで
 * 取得済み・複数batchにまたがってよい)から、「最新batchの新着件数 N」に応じて
 * 5〜10件の可変件数でカードを選定する。
 *
 * display_count = clamp(N, min, max)  (デフォルト min=5, max=10)
 *   - N >= min: 最新batchの中からpublished_at整理でmax件まで(既存selectFastestCardsと同じ挙動)
 *   - N <  min: 最新batchの全件 + 「batchより前の同メーカー候補」から (min-N)件を
 *               fetched_at降順(直近に登録された順)で補完し、合計min件を目指す。
 *               補完候補が足りない場合は存在する分だけ返す(無理な水増しをしない)。
 *
 * floorの決定は最新batchの行のみを見て行う(既存selectFastestCardsと同じ)。
 * dedupeは「最新batch + 補完候補プール」を合わせた全体に対して行ってから
 * batch/補完に分割し直す — これにより補完作品が最新batchの作品と同一作品
 * (本編+BOD等の派生SKU)である場合の重複表示を防ぐ。
 *
 * @template {FastestBatchRow & { external_id: string, title: string | null }} T
 * @param {T[]} allRows 1メーカー分の全候補行。fetched_at降順である必要はないが、
 *   「同一fetched_at値の行群 = 最新batch」を判定するため、少なくとも
 *   最大のfetched_atを持つ行が先頭付近に存在すること(呼び出し側はRPCの
 *   `order by maker_id, fetched_at desc` 結果をそのまま渡せばよい)。
 * @param {string} nowIso
 * @param {{ min?: number, max?: number }} [opts]
 * @returns {T[]}
 */
export function selectFastestCardsVariable(allRows, nowIso, opts = {}) {
  const min = opts.min ?? 5
  const max = opts.max ?? 10
  if (allRows.length === 0) return []

  const latestFetchedAt = allRows.reduce(
    (latest, r) => (r.fetched_at > latest ? r.fetched_at : latest),
    allRows[0].fetched_at,
  )
  const batchOnly = allRows.filter((r) => r.fetched_at === latestFetchedAt)
  const floor = pickDisplayFloor(batchOnly)
  if (!floor) return []

  // floor決定後・dedupe前に「最新batch」「それより前の補完候補プール」へ分ける前に、
  // 重複(同一作品の派生SKU)を全体でまとめて解消してから分割し直す(batch/補完をまたいだ
  // 重複を防ぐため)。
  const floorRows = allRows.filter((r) => r.floor === floor && r.published_at != null)
  const deduped = dedupeSameWork(floorRows)
  const batch = deduped.filter((r) => r.fetched_at === latestFetchedAt)
  const pool = deduped.filter((r) => r.fetched_at !== latestFetchedAt)

  const batchOrdered = orderByPublishedAt(batch, nowIso)
  const n = batchOrdered.length
  if (n === 0) return []

  const target = Math.max(min, Math.min(n, max)) // clamp(n, min, max)
  if (n >= target) return batchOrdered.slice(0, target)

  // 補完: batchより前(fetched_at昇順で見て過去)の候補から、fetched_at降順
  // (直近に登録された順)で不足分だけ追加する。batch作品の重複補完は上記の
  // 全体dedupeで構造的に排除済み。
  const need = target - n
  const poolOrdered = [...pool].sort((a, b) => (a.fetched_at < b.fetched_at ? 1 : a.fetched_at > b.fetched_at ? -1 : 0))
  return [...batchOrdered, ...poolOrdered.slice(0, need)]
}

/**
 * Phase 1(1000行cap対応): 配列を size 件ずつのチャンクに分割する。
 * PostgREST/Supabaseのレスポンス既定上限(1000行)を回避するため、
 * fetchAllCandidatesRaw() がメーカーID配列を分割してRPCを複数回呼ぶ際に使う。
 * size <= 0 の場合は分割不能として単一チャンク([arr])を返す(無限ループ防止)。
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
export function chunkArray(arr, size) {
  if (size <= 0) return arr.length ? [arr] : []
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

/**
 * Phase 1(1000行cap対応): 複数チャンクのRPC結果を1つにマージする(pure)。
 * 各チャンク結果は { ok: true, rows: T[] }(成功) | { ok: false }(失敗) の
 * 形に正規化して渡す(呼び出し元がPromise.allSettledの結果をこの形へ変換する)。
 * - 失敗したチャンクは無視し、成功したチャンクのrowsだけをflattenする
 *   (graceful degradation — 1チャンクの失敗で全体を失敗させない。理由は
 *    fastestReleases.ts の fetchAllCandidatesRaw() 側コメント参照)。
 * - external_id単位でdedupe(先勝ち)する。メーカーIDは1チャンクにのみ属する
 *   ため境界を跨いだ重複は理論上発生しないが、安全側のマージとして行う。
 * - allFailed: チャンクが1件以上あり、かつ全チャンクが失敗した場合にtrue
 *   (呼び出し元はこれを見て例外を投げるかどうかを判断する)。
 * @template {{ external_id: string }} T
 * @param {({ ok: true, rows: T[] } | { ok: false })[]} chunkResults
 * @returns {{ rows: T[], allFailed: boolean, failedCount: number }}
 */
export function mergeCandidateChunks(chunkResults) {
  const rows = []
  let failedCount = 0
  for (const result of chunkResults) {
    if (!result.ok) {
      failedCount++
      continue
    }
    rows.push(...result.rows)
  }

  const seen = new Set()
  const deduped = []
  for (const r of rows) {
    if (seen.has(r.external_id)) continue
    seen.add(r.external_id)
    deduped.push(r)
  }

  const allFailed = chunkResults.length > 0 && failedCount === chunkResults.length
  return { rows: deduped, allFailed, failedCount }
}

/**
 * Phase 1: メーカーセクションの表示順を決める。
 * 「最新batchのfetched_at降順」を主基準にし、fetched_atが同一(または両方null=
 * 候補無し)の場合は makerIdOrder 上の出現順で安定的にタイブレークする
 * (同じ入力なら常に同じ順序になることを保証する)。
 * makerIdOrder に無いmakerIdは末尾へ(見つからない場合の安全側フォールバック)。
 * @param {{ makerId: string, latestFetchedAt: string | null }[]} makers
 * @param {string[]} makerIdOrder 全メーカーの基本順序(例: src/lib/makers.ts の MAKERS 順)
 * @returns {typeof makers}
 */
export function sortMakerSections(makers, makerIdOrder) {
  const indexOf = new Map(makerIdOrder.map((id, i) => [id, i]))
  return [...makers].sort((a, b) => {
    if (a.latestFetchedAt !== b.latestFetchedAt) {
      if (a.latestFetchedAt == null) return 1
      if (b.latestFetchedAt == null) return -1
      return a.latestFetchedAt < b.latestFetchedAt ? 1 : -1
    }
    const ia = indexOf.has(a.makerId) ? indexOf.get(a.makerId) : Number.MAX_SAFE_INTEGER
    const ib = indexOf.has(b.makerId) ? indexOf.get(b.makerId) : Number.MAX_SAFE_INTEGER
    return ia - ib
  })
}
