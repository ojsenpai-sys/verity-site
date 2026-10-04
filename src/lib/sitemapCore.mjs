// src/lib/sitemapCore.mjs — VERITY sitemap の純粋ロジック（I/O なし・node:test 対象）。
//
// 構成（Sitemap Reliability Phase 1A–1C）:
//   /sitemap.xml                          … sitemap index（DB 非依存）
//   /sitemap-static.xml                   … static + spotlight（レジストリ由来）
//   /sitemap-actresses.xml                … 女優（全件・ページング）
//   /sitemap-news.xml                     … ニュース（全件・ページング）
//   /sitemap-articles.xml?month=YYYY-MM   … 作品（発売月 JST 単位）
//
// 子 sitemap はすべてサイトルート直下に置く（sitemaps.org の location rule:
// sitemap は自身のディレクトリ以下の URL しか対象にできないため。Search Console の
// 登録状況に依存しない）。
//
// URL は各ページの canonical 実装と完全一致させる（推測しない）:
//   作品   … `${BASE}/articles/${slug}`              （articles/[slug]/page.tsx）
//   女優   … `${BASE}/verity/actresses/${external_id}`（actresses/[id]/page.tsx・external_id で引く）
//   ニュース … `${BASE}/news/${slug}`                  （news/[slug]/page.tsx）
//   ランキング … `${BASE}/ranking`                      （ranking/page.tsx）

/** sitemaps.org / Google の上限: 1 ファイルあたり 50,000 URL。 */
export const MAX_URLS_PER_SITEMAP = 50_000

/** Supabase(PostgREST) の 1 リクエスト最大行数。これを超える range は黙って切り詰められる。 */
export const PAGE_SIZE = 1000

/** 作品 sitemap の最初の発売月（JST）。Phase 0 実測で 2007-02 〜 現在の全月に作品が存在。 */
export const ARTICLE_SITEMAP_START_MONTH = '2007-02'

const JST_OFFSET_MS = 9 * 3600 * 1000
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/

// ── XML ───────────────────────────────────────────────────────────────────────

/** XML テキスト/属性値のエスケープ（& は最初に置換すること）。 */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** lastmod を W3C Datetime（ISO 8601 UTC）へ正規化。不正値は null（＝lastmod を出さない）。 */
export function toLastmod(value) {
  if (value == null || value === '') return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/**
 * <urlset> を生成する。entries: { loc, lastmod?, changefreq?, priority? }[]
 * 同一 loc は先勝ちで 1 件に畳む（ページ境界の取りこぼし再取得等による重複を出さない）。
 * 50,000 件超は仕様違反のため throw（呼び出し側で 503 に変換）。
 */
export function buildUrlsetXml(entries) {
  const seen = new Set()
  const unique = []
  for (const e of entries) {
    if (!e || !e.loc || seen.has(e.loc)) continue
    seen.add(e.loc)
    unique.push(e)
  }
  if (unique.length > MAX_URLS_PER_SITEMAP) {
    throw new Error(`sitemap exceeds ${MAX_URLS_PER_SITEMAP} URLs (${unique.length})`)
  }
  const body = unique.map((e) => {
    const parts = [`<loc>${escapeXml(e.loc)}</loc>`]
    const lastmod = toLastmod(e.lastmod)
    if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`)
    if (e.changefreq) parts.push(`<changefreq>${escapeXml(e.changefreq)}</changefreq>`)
    if (e.priority != null) parts.push(`<priority>${Number(e.priority).toFixed(1)}</priority>`)
    return `<url>${parts.join('')}</url>`
  })
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body.join('\n') + (body.length ? '\n' : '') +
    '</urlset>\n'
  )
}

/** <sitemapindex> を生成する。locs: string[]（重複は除去）。 */
export function buildSitemapIndexXml(locs) {
  const unique = [...new Set(locs.filter(Boolean))]
  if (unique.length > MAX_URLS_PER_SITEMAP) {
    throw new Error(`sitemap index exceeds ${MAX_URLS_PER_SITEMAP} entries (${unique.length})`)
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    unique.map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('\n') + (unique.length ? '\n' : '') +
    '</sitemapindex>\n'
  )
}

// ── 月（JST） ─────────────────────────────────────────────────────────────────

/** 日時（ms/Date/ISO）→ JST の 'YYYY-MM'。 */
export function jstMonthOf(value) {
  const t = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)
  return new Date(t + JST_OFFSET_MS).toISOString().slice(0, 7)
}

function nextMonth(month) {
  const [, y, m] = MONTH_RE.exec(month)
  const yy = Number(y), mm = Number(m)
  return mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, '0')}`
}

/** start〜end（両端含む・'YYYY-MM'）の月リスト。start > end なら空。 */
export function monthRange(start, end) {
  if (!MONTH_RE.test(start) || !MONTH_RE.test(end)) throw new Error('invalid month range')
  const out = []
  for (let m = start; m <= end; m = nextMonth(m)) out.push(m)
  return out
}

/** sitemap index に載せる作品月リスト（ARTICLE_SITEMAP_START_MONTH〜現在の JST 月）。 */
export function articleSitemapMonths(nowMs) {
  return monthRange(ARTICLE_SITEMAP_START_MONTH, jstMonthOf(nowMs))
}

/**
 * month パラメータ検証。形式 'YYYY-MM' かつ START〜現在 JST 月の範囲のみ有効。
 * 無効なら null（route 側で 404）。
 */
export function parseArticleMonth(value, nowMs) {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) return null
  if (value < ARTICLE_SITEMAP_START_MONTH || value > jstMonthOf(nowMs)) return null
  return value
}

/** JST 月の UTC 境界 [fromIso, toIso)。 */
export function jstMonthBoundsUtc(month) {
  if (!MONTH_RE.test(month)) throw new Error(`invalid month: ${month}`)
  const toUtcIso = (m) => new Date(Date.parse(`${m}-01T00:00:00+09:00`)).toISOString()
  return { fromIso: toUtcIso(month), toIso: toUtcIso(nextMonth(month)) }
}

/** 月のキャッシュ階層: 当月・前月は 'recent'（短 TTL）、それ以前は 'archive'（長 TTL）。 */
export function monthCacheTier(month, nowMs) {
  const [y, m] = jstMonthOf(nowMs).split('-').map(Number)
  const previous = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  return month >= previous ? 'recent' : 'archive'
}

// ── URL（canonical と完全一致） ───────────────────────────────────────────────

export function trimBase(base) {
  return String(base).replace(/\/+$/, '')
}
export function articleUrl(base, slug) {
  return `${trimBase(base)}/articles/${slug}`
}
export function actressUrl(base, externalId) {
  return `${trimBase(base)}/verity/actresses/${externalId}`
}
export function newsUrl(base, slug) {
  return `${trimBase(base)}/news/${slug}`
}

/** sitemap index が列挙する子 sitemap の絶対 URL。 */
export function childSitemapUrls(base, nowMs) {
  const b = trimBase(base)
  return [
    `${b}/sitemap-static.xml`,
    `${b}/sitemap-actresses.xml`,
    `${b}/sitemap-news.xml`,
    ...articleSitemapMonths(nowMs).map((m) => `${b}/sitemap-articles.xml?month=${m}`),
  ]
}

/**
 * static sitemap の entries。spotlights は lib/spotlights.ts のレジストリ
 * （publicUrl = canonical）を渡す。changefreq/priority は既存 static と同じ流儀。
 * ※ Google は changefreq/priority を使わない（互換のため既存値を踏襲するのみ）。
 */
export function staticEntries(base, spotlights = []) {
  const b = trimBase(base)
  return [
    { loc: b,                                  changefreq: 'daily',  priority: 1.0 },
    { loc: `${b}/actresses`,                   changefreq: 'daily',  priority: 0.9 },
    { loc: `${b}/news`,                        changefreq: 'daily',  priority: 0.8 },
    // ランキング（canonical はベアパス /ranking）
    { loc: `${b}/ranking`,                     changefreq: 'daily',  priority: 0.7 },
    { loc: `${b}/verity/rankings/weekly`,      changefreq: 'weekly', priority: 0.6 },
    // イベントハブ
    { loc: `${b}/verity/events`,               changefreq: 'weekly', priority: 0.6 },
    { loc: `${b}/verity/events/tre2026`,       changefreq: 'daily',  priority: 0.7 },
    // 特集・カタログ
    { loc: `${b}/verity/features`,             changefreq: 'weekly', priority: 0.6 },
    { loc: `${b}/verity/videos`,               changefreq: 'daily',  priority: 0.6 },
    { loc: `${b}/verity/makers`,               changefreq: 'weekly', priority: 0.6 },
    { loc: `${b}/verity/special/minamo`,       changefreq: 'weekly', priority: 0.6 },
    { loc: `${b}/verity/lovedoll`,             changefreq: 'weekly', priority: 0.6 },
    // VERITY Spotlight（レジストリ由来・追加漏れ防止）
    ...spotlights.map((s) => ({ loc: `${b}${s.publicUrl}`, changefreq: 'weekly', priority: 0.7 })),
  ]
}

// ── ページング ────────────────────────────────────────────────────────────────

/**
 * 決定的順序のクエリを PAGE_SIZE 件ずつ全件取得する。
 *   fetchPage(from, to) → Promise<{ data: any[] | null, error: unknown }>
 * - 最終ページ（< pageSize）で終了。ちょうど pageSize の場合は次ページを確認する。
 * - error / data 不正は throw（部分結果を成功扱いしない）。
 * - keyOf を渡すと同一キーを先勝ちで除去（並行 INSERT によるページ境界の重複対策）。
 * - maxPages 超過は throw（暴走防止）。
 *
 * @param {(from: number, to: number) => PromiseLike<{ data: any[] | null, error: any }> | { data: any[] | null, error: any } | null} fetchPage
 * @param {{ pageSize?: number, keyOf?: (row: any) => unknown, maxPages?: number }} [options]
 * @returns {Promise<any[]>}
 */
export async function fetchAllPages(fetchPage, { pageSize = PAGE_SIZE, keyOf, maxPages = 1000 } = {}) {
  const rows = []
  const seen = keyOf ? new Set() : null
  for (let page = 0; ; page++) {
    if (page >= maxPages) throw new Error(`fetchAllPages: exceeded ${maxPages} pages`)
    const from = page * pageSize
    const res = await fetchPage(from, from + pageSize - 1)
    if (!res || res.error) {
      const msg = res?.error?.message ?? String(res?.error ?? 'no response')
      throw new Error(`fetchAllPages: page ${page} failed: ${msg}`)
    }
    if (!Array.isArray(res.data)) throw new Error(`fetchAllPages: page ${page} returned no data array`)
    for (const row of res.data) {
      if (seen) {
        const k = keyOf(row)
        if (seen.has(k)) continue
        seen.add(k)
      }
      rows.push(row)
    }
    if (res.data.length < pageSize) return rows
  }
}
