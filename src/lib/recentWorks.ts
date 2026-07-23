/**
 * 「最近見た作品」— localStorage ベースの閲覧履歴ユーティリティ。
 *
 * 設計方針:
 *   - ログイン不要。DB / RPC / migration を一切増やさず、クライアント localStorage のみで完結する。
 *   - SSR 中は window/localStorage を参照しない（全関数が window 未定義で安全に no-op）。
 *   - 破損 JSON・非配列・欠損フィールドは握り潰し、描画を壊さない（読み取りは常に配列を返す）。
 *   - 保存件数は MAX=10 件でキャップし、容量を増やしすぎない。
 *   - 正規データ（title/画像/女優名）は最小限のスナップショットのみ保存する。FANZA URL は
 *     アフィリエイト変換前の生 URL を保存し、描画時に withAffiliate() で現在の af_id を都度付与する。
 *
 * 表示側は RecentlyViewedSection、記録側は RecentlyViewedRecorder（作品ページ）が参照する。
 */

/** localStorage に保存する 1 作品分の最小スナップショット。 */
export type RecentWork = {
  /** 作品の正規識別子（DMM CID = articles.external_id）。fanza_click の target_id 兼 重複判定キー。 */
  cid: string
  /** VERITY 内 URL 用 slug（/verity/articles/${slug}）。 */
  slug: string
  /** 作品タイトル。 */
  title: string
  /** サムネイル生 URL（描画時に image proxy 経由で表示）。取得不能時は null。 */
  img: string | null
  /** 主演女優名（表示補助・任意）。 */
  actress?: string
  /** FANZA アフィリエイト変換前の生 URL（任意）。描画時に withAffiliate() を適用する。 */
  fz?: string
  /** 閲覧日時（epoch ms）。先頭＝最新。 */
  ts: number
}

const KEY = 'verity_recent_works'
const MAX = 10

/** 履歴が変化した際に発火するカスタムイベント名（同一タブ内の表示更新用）。 */
export const RECENT_CHANGED_EVENT = 'verity:recent-changed'

/** 破損データ混入を防ぐための最小バリデーション。 */
function isValidRecent(v: unknown): v is RecentWork {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.cid === 'string' &&
    r.cid.length > 0 &&
    typeof r.slug === 'string' &&
    r.slug.length > 0 &&
    typeof r.title === 'string'
  )
}

/** 重複判定キー。CID を優先し、無ければ slug にフォールバックする。 */
function dedupKey(item: Pick<RecentWork, 'cid' | 'slug'>): string {
  return item.cid || item.slug
}

/**
 * 履歴を新しい順で読み取る。
 * SSR / localStorage 不可 / 破損時はいずれも空配列を返し、例外を投げない。
 */
export function readRecentWorks(): RecentWork[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidRecent).slice(0, MAX)
  } catch {
    return []
  }
}

/** 履歴を書き込み、変更イベントを発火する。失敗は握り潰す。 */
function writeRecentWorks(list: RecentWork[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
    window.dispatchEvent(new CustomEvent(RECENT_CHANGED_EVENT))
  } catch {
    /* QuotaExceeded / プライベートモード等は無視 */
  }
}

/**
 * 作品を履歴の先頭へ追加する。
 *   - 同一作品（CID / slug 一致）が既存なら重複させず先頭へ移動する。
 *   - 先頭追加後に MAX=10 件でキャップする。
 * cid / slug が欠落している場合は何もしない。
 */
export function addRecentWork(item: RecentWork): void {
  if (typeof window === 'undefined') return
  if (!item.cid || !item.slug) return

  const entry: RecentWork = {
    cid: item.cid,
    slug: item.slug,
    // タイトルは念のため長さを制限し、容量肥大を防ぐ。
    title: (item.title ?? '').slice(0, 200),
    img: item.img ?? null,
    ...(item.actress ? { actress: item.actress.slice(0, 80) } : {}),
    ...(item.fz ? { fz: item.fz } : {}),
    ts: item.ts,
  }

  const key = dedupKey(entry)
  const rest = readRecentWorks().filter((r) => dedupKey(r) !== key)
  writeRecentWorks([entry, ...rest])
}

/** 履歴を全消去し、変更イベントを発火する。 */
export function clearRecentWorks(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
    window.dispatchEvent(new CustomEvent(RECENT_CHANGED_EVENT))
  } catch {
    /* 無視 */
  }
}
