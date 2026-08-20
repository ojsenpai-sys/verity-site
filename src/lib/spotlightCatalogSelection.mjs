// src/lib/spotlightCatalogSelection.mjs — 女優カタログ（MORE MIYU等）の pure 選定ロジック。
//
// 同一作品の別SKU（videoa/dvd/BOD等）の安全判定は Phase F-3 の canonicalCidBase /
// isSameWorkTitleGroup をそのまま再利用する（新しい判定基準を作らない・重複実装しない）。
// 断定できないグループはdedupeしない（false positiveより重複残存を優先）。
//
// pure function のみ — 副作用なし・DB非依存。node:test で直接テスト可能。
import { canonicalCidBase, isSameWorkTitleGroup } from './fastestReleasesSelection.mjs'

export const BEST_TAG = 'ベスト・総集編'

/** VR作品判定（tagsのいずれかが "VR" で始まる。ArticleCard.tsxと同一基準）。 */
export function isVr(tags) {
  return (tags ?? []).some((t) => /^VR/.test(t))
}

/** metadata.actress の長さで単独主演か判定する（多女優作品の二重計上防止）。 */
export function isSingleActress(row) {
  const list = row.metadata?.actress
  return Array.isArray(list) && list.length === 1
}

function floorOf(row) {
  const f = row.metadata?.floor
  return typeof f === 'string' ? f : null
}

/**
 * 代表SKU選定: videoa優先 → タイトルが短い方(本編)優先 → external_id昇順で安定タイブレーク。
 * Fastest Releasesのdedupeは既にfloor選定を終えた後段で使うため代表選定にfloor優先度を
 * 持たないが、本カタログはvideoa/dvd混在プールを直接dedupeするためfloor優先が必要
 * （既存 dedupeSameWork の内部関数は非公開のため、ここで別途定義する）。
 * @template {{ external_id: string, title: string | null, metadata: Record<string, unknown> | null }} T
 * @param {T[]} group
 * @returns {T}
 */
export function pickCatalogRepresentative(group) {
  return [...group].sort((a, b) => {
    const av = floorOf(a) === 'videoa' ? 0 : 1
    const bv = floorOf(b) === 'videoa' ? 0 : 1
    if (av !== bv) return av - bv
    const la = (a.title ?? '').length
    const lb = (b.title ?? '').length
    if (la !== lb) return la - lb
    return a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0
  })[0]
}

/**
 * canonicalCidBase でグループ化し、タイトル接頭辞が安全に一致するグループのみ
 * 代表1件へ統合する。断定できないグループは全件そのまま残す。
 * @template {{ external_id: string, title: string | null, metadata: Record<string, unknown> | null }} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function dedupeCatalog(rows) {
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
      result.push(pickCatalogRepresentative(group))
    } else {
      result.push(...group)
    }
  }
  return result
}

const FILTER_TAG = { bishoujo: '美少女', kyonyu: '巨乳', chijo: '痴女', joshikosei: '女子校生' }

/**
 * フィルタ適用判定。BEST/総集編は「best」フィルタのときだけ対象に含め、
 * 通常フィルタからは除外する（通常カタログにBESTを紛れ込ませない）。
 * @param {{ tags: string[] | null }} row
 * @param {'all'|'bishoujo'|'kyonyu'|'chijo'|'joshikosei'|'vr'|'best'} filter
 * @returns {boolean}
 */
export function matchesFilter(row, filter) {
  const hasBestTag = (row.tags ?? []).includes(BEST_TAG)
  if (filter === 'best') return hasBestTag
  if (hasBestTag) return false
  if (filter === 'vr') return isVr(row.tags)
  const tag = FILTER_TAG[filter]
  if (!tag) return true // 'all'
  return (row.tags ?? []).includes(tag)
}

/**
 * published_at 降順(同値は fetched_at 降順でタイブレーク)。
 * @param {{ published_at: string | null, fetched_at: string }} a
 * @param {{ published_at: string | null, fetched_at: string }} b
 */
export function compareRecency(a, b) {
  const ap = a.published_at ?? ''
  const bp = b.published_at ?? ''
  if (ap !== bp) return ap < bp ? 1 : -1
  return a.fetched_at < b.fetched_at ? 1 : a.fetched_at > b.fetched_at ? -1 : 0
}

/**
 * ページング（もっと見る）用の切り出し。getActressCatalogPage と同じ境界ロジックを
 * pure関数として直接テストできるようにする。
 * @template T
 * @param {T[]} items
 * @param {number} offset
 * @param {number} limit
 * @returns {{ page: T[], total: number, hasMore: boolean }}
 */
export function paginate(items, offset, limit) {
  const total = items.length
  const page = items.slice(offset, offset + limit)
  return { page, total, hasMore: offset + limit < total }
}
