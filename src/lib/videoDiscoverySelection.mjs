// src/lib/videoDiscoverySelection.mjs — VIDEO DISCOVERY（/verity/videos）の作品選定ロジック(pure)。
//
// データ源は既存キャッシュのみ（新RPC・DB scanなし）:
//   NEW RELEASES      … getFastestReleasesSections() のカード（＋同一キャッシュの候補行で metadata を補完）
//   POPULAR ON VERITY … getTopRankedWorks()（works_ranking_cache）
//
// 共通の採用条件:
//   - floor = 'videoa'（dvd は sample_movie_url を持たないため対象外）
//   - sample_movie_url（FANZA公式 litevideo プレイヤーURL）あり
//   - published_at <= now（発売前作品のプレイヤー可用性は未確認のため除外）
//   - CID 重複なし
// 件数が上限に満たない場合も補充しない（取得できた件数だけ表示する）。

export const MAX_PER_ROW = 6
export const MAX_PER_MAKER = 2

/**
 * @typedef {Object} VideoCandidate
 * @property {string} cid
 * @property {string|null} [makerId]
 * @property {string|null} floor
 * @property {string|null} sampleMovieUrl
 * @property {string|null} publishedAt
 * @property {string|null} [fetchedAt]
 * @property {number} [rank]
 */

/** published_at が now 以前か。不正/欠損は「発売済みと断定できない」ため false。 */
export function isReleased(publishedAt, nowMs) {
  if (!publishedAt) return false
  const t = Date.parse(publishedAt)
  return Number.isFinite(t) && t <= nowMs
}

/** 共通の採用条件（videoa・sampleあり・発売済み）。 */
export function isPlayableCandidate(c, nowMs) {
  return (
    !!c &&
    typeof c.cid === 'string' && c.cid.length > 0 &&
    c.floor === 'videoa' &&
    typeof c.sampleMovieUrl === 'string' && c.sampleMovieUrl.length > 0 &&
    isReleased(c.publishedAt, nowMs)
  )
}

function timeOf(iso) {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

/**
 * NEW RELEASES: 発売日の新しい順（同着は fetched_at 降順 → CID 降順で安定化）。
 * 1メーカー最大 perMaker 本・最大 max 本。
 * @param {VideoCandidate[]} candidates
 * @param {{ nowMs: number, max?: number, perMaker?: number }} opts
 * @returns {VideoCandidate[]}
 */
export function selectNewReleases(candidates, { nowMs, max = MAX_PER_ROW, perMaker = MAX_PER_MAKER }) {
  const seen = new Set()
  const pool = []
  for (const c of candidates ?? []) {
    if (!isPlayableCandidate(c, nowMs) || seen.has(c.cid)) continue
    seen.add(c.cid)
    pool.push(c)
  }
  pool.sort((a, b) =>
    timeOf(b.publishedAt) - timeOf(a.publishedAt) ||
    timeOf(b.fetchedAt) - timeOf(a.fetchedAt) ||
    (a.cid < b.cid ? 1 : a.cid > b.cid ? -1 : 0),
  )

  const perMakerCount = new Map()
  const out = []
  for (const c of pool) {
    if (out.length >= max) break
    const key = c.makerId ?? `__no_maker__${c.cid}`
    const n = perMakerCount.get(key) ?? 0
    if (n >= perMaker) continue
    perMakerCount.set(key, n + 1)
    out.push(c)
  }
  return out
}

/**
 * POPULAR ON VERITY: ランキング順（rank 昇順）を維持。excludeCids（NEW 採用分）と重複除外。
 * @param {VideoCandidate[]} ranked
 * @param {{ nowMs: number, max?: number, excludeCids?: Iterable<string> }} opts
 * @returns {VideoCandidate[]}
 */
export function selectPopular(ranked, { nowMs, max = MAX_PER_ROW, excludeCids = [] }) {
  const seen = new Set(excludeCids)
  const sorted = [...(ranked ?? [])].sort((a, b) => (a?.rank ?? Infinity) - (b?.rank ?? Infinity))
  const out = []
  for (const c of sorted) {
    if (out.length >= max) break
    if (!isPlayableCandidate(c, nowMs) || seen.has(c.cid)) continue
    seen.add(c.cid)
    out.push(c)
  }
  return out
}

// ── 計測メタ ──────────────────────────────────────────────────────────────────
// cid は trackEvent 側で target_id に載るため含めない（既存 heroV21 previewMeta と同規約）。

export const VIDEO_DISCOVERY_SOURCE = 'video_discovery'

/** 行（棚）ごとの FANZA 導線 position。fanza_click の導線切り分け用（既存 position 規約に合わせる）。 */
export function fanzaPosition(row) {
  return `video_discovery_${row}`
}

/**
 * preview_open / preview_close / fanza_click 共通メタ。
 * 棚内位置は `slot` で持つ（`position` は既存規約で fanza_click の導線識別子(文字列)であり、
 * FanzaLink は meta を position の後に展開するため、ここで position を持つと導線IDを上書きしてしまう）。
 * @param {'new'|'popular'} row
 * @param {number} slot 棚内の 1 始まり位置
 */
export function catalogMeta(row, slot) {
  return { source: VIDEO_DISCOVERY_SOURCE, row, slot }
}

/** close 時の滞在時間(ms)。負値・非数は 0 に丸める。 */
export function dwellMs(openedAt, closedAt) {
  const d = Math.round(Number(closedAt) - Number(openedAt))
  return Number.isFinite(d) && d > 0 ? d : 0
}
