// scripts/__tests__/sitemap-core.test.mjs
// 実行: node --test scripts/__tests__/sitemap-core.test.mjs
//
// src/lib/sitemapCore.mjs（sitemap index / 分割 sitemap の純粋ロジック）を対象とする。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_URLS_PER_SITEMAP,
  PAGE_SIZE,
  ARTICLE_SITEMAP_START_MONTH,
  escapeXml,
  toLastmod,
  buildUrlsetXml,
  buildSitemapIndexXml,
  jstMonthOf,
  monthRange,
  articleSitemapMonths,
  parseArticleMonth,
  jstMonthBoundsUtc,
  monthCacheTier,
  articleUrl,
  actressUrl,
  newsUrl,
  childSitemapUrls,
  staticEntries,
  fetchAllPages,
} from '../../src/lib/sitemapCore.mjs'

const BASE = 'https://verity-official.com'
// 2026-10-05 12:00 JST
const NOW = Date.parse('2026-10-05T03:00:00Z')

// ── A. month list ─────────────────────────────────────────────────────────────

test('A: monthRange は両端を含み年跨ぎも正しい', () => {
  assert.deepEqual(monthRange('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'])
  assert.deepEqual(monthRange('2026-03', '2026-03'), ['2026-03'])
  assert.deepEqual(monthRange('2026-04', '2026-03'), [])
  assert.throws(() => monthRange('2026-13', '2026-14'))
})

test('A: articleSitemapMonths は 2007-02〜現在JST月（Phase 0 実測と同じ 237 か月）', () => {
  const months = articleSitemapMonths(NOW)
  assert.equal(months[0], ARTICLE_SITEMAP_START_MONTH)
  assert.equal(months.at(-1), '2026-10')
  assert.equal(months.length, 237)
  assert.equal(new Set(months).size, months.length)
})

// ── B. JST month boundary ────────────────────────────────────────────────────

test('B: jstMonthOf は JST で月を判定する（UTC 月末 15:00 以降は翌月）', () => {
  assert.equal(jstMonthOf('2026-09-30T14:59:59Z'), '2026-09')
  assert.equal(jstMonthOf('2026-09-30T15:00:00Z'), '2026-10')
  assert.equal(jstMonthOf(Date.parse('2026-12-31T15:00:00Z')), '2027-01')
})

test('B: jstMonthBoundsUtc は JST 月初 00:00 の UTC [from, to)', () => {
  assert.deepEqual(jstMonthBoundsUtc('2026-10'), {
    fromIso: '2026-09-30T15:00:00.000Z',
    toIso: '2026-10-31T15:00:00.000Z',
  })
  assert.deepEqual(jstMonthBoundsUtc('2026-12'), {
    fromIso: '2026-11-30T15:00:00.000Z',
    toIso: '2026-12-31T15:00:00.000Z',
  })
  // 境界: from は含む・to は含まない（jstMonthOf と整合）
  const { fromIso, toIso } = jstMonthBoundsUtc('2026-10')
  assert.equal(jstMonthOf(fromIso), '2026-10')
  assert.equal(jstMonthOf(Date.parse(toIso) - 1), '2026-10')
  assert.equal(jstMonthOf(toIso), '2026-11')
})

test('B: monthCacheTier は当月・前月のみ recent', () => {
  assert.equal(monthCacheTier('2026-10', NOW), 'recent')
  assert.equal(monthCacheTier('2026-09', NOW), 'recent')
  assert.equal(monthCacheTier('2026-08', NOW), 'archive')
  assert.equal(monthCacheTier('2007-02', NOW), 'archive')
  const jan = Date.parse('2027-01-10T03:00:00Z')
  assert.equal(monthCacheTier('2026-12', jan), 'recent')
  assert.equal(monthCacheTier('2026-11', jan), 'archive')
})

// ── C. XML escaping ──────────────────────────────────────────────────────────

test('C: escapeXml は & < > " \' をエスケープ（& は二重エスケープしない順序）', () => {
  assert.equal(escapeXml(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f')
  assert.equal(escapeXml('&amp;'), '&amp;amp;')
  assert.equal(escapeXml('plain-slug_1.2~'), 'plain-slug_1.2~')
})

test('C: toLastmod は W3C Datetime(UTC) へ正規化・不正値は null', () => {
  assert.equal(toLastmod('2026-09-27T15:30:31.408105+00:00'), '2026-09-27T15:30:31.408Z')
  assert.equal(toLastmod('2026-10-01T00:00:00+09:00'), '2026-09-30T15:00:00.000Z')
  assert.equal(toLastmod(null), null)
  assert.equal(toLastmod(''), null)
  assert.equal(toLastmod('not-a-date'), null)
})

// ── D. sitemap index XML ─────────────────────────────────────────────────────

test('D: sitemap index は static/actresses/news + 全月を絶対URLで列挙', () => {
  const locs = childSitemapUrls(BASE, NOW)
  assert.equal(locs.length, 3 + 237)
  assert.equal(locs[0], `${BASE}/sitemap-static.xml`)
  assert.equal(locs[1], `${BASE}/sitemap-actresses.xml`)
  assert.equal(locs[2], `${BASE}/sitemap-news.xml`)
  assert.equal(locs[3], `${BASE}/sitemap-articles.xml?month=2007-02`)
  assert.equal(locs.at(-1), `${BASE}/sitemap-articles.xml?month=2026-10`)
  assert.ok(locs.every((l) => l.startsWith('https://')))

  const xml = buildSitemapIndexXml(locs)
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
  assert.ok(xml.trimEnd().endsWith('</sitemapindex>'))
  assert.equal((xml.match(/<sitemap>/g) || []).length, 240)
  assert.ok(xml.includes(`<loc>${BASE}/sitemap-articles.xml?month=2026-10</loc>`))
})

test('D: index の loc 内の & はエスケープされ、重複は除去される', () => {
  const xml = buildSitemapIndexXml(['https://x.test/a.xml?m=1&n=2', 'https://x.test/a.xml?m=1&n=2'])
  assert.ok(xml.includes('<loc>https://x.test/a.xml?m=1&amp;n=2</loc>'))
  assert.equal((xml.match(/<sitemap>/g) || []).length, 1)
})

test('D: childSitemapUrls は base 末尾スラッシュを正規化', () => {
  assert.equal(childSitemapUrls(`${BASE}/`, NOW)[0], `${BASE}/sitemap-static.xml`)
})

// ── E. urlset XML ────────────────────────────────────────────────────────────

test('E: urlset は loc/lastmod/changefreq/priority を正しく出力し、lastmod 無しは省略', () => {
  const xml = buildUrlsetXml([
    { loc: `${BASE}/articles/a`, lastmod: '2026-09-27T15:30:31+00:00', changefreq: 'monthly', priority: 0.6 },
    { loc: `${BASE}/verity/actresses/dmm-actress-1`, changefreq: 'weekly', priority: 0.7 },
  ])
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
  assert.ok(xml.includes(`<url><loc>${BASE}/articles/a</loc><lastmod>2026-09-27T15:30:31.000Z</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`))
  assert.ok(xml.includes(`<url><loc>${BASE}/verity/actresses/dmm-actress-1</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`))
  assert.ok(!/<lastmod>[^<]*<\/lastmod><changefreq>weekly/.test(xml))
})

test('E: 空の urlset も well-formed', () => {
  assert.equal(buildUrlsetXml([]), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n')
})

test('E: 50,000 URL 超は throw（仕様違反を出さない）', () => {
  const many = Array.from({ length: MAX_URLS_PER_SITEMAP + 1 }, (_, i) => ({ loc: `${BASE}/articles/s${i}` }))
  assert.throws(() => buildUrlsetXml(many), /exceeds 50000/)
  assert.doesNotThrow(() => buildUrlsetXml(many.slice(0, MAX_URLS_PER_SITEMAP)))
})

// ── F. pagination（999 / 1000 / 1001 / 2000 / 2001） ─────────────────────────

function fakeSource(total) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `id-${String(i).padStart(6, '0')}` }))
  const calls = []
  const fetchPage = async (from, to) => {
    calls.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  }
  return { rows, calls, fetchPage }
}

for (const [total, expectedCalls] of [[0, 1], [999, 1], [1000, 2], [1001, 2], [2000, 3], [2001, 3]]) {
  test(`F: pagination total=${total} → 全件・重複なし・${expectedCalls} リクエスト`, async () => {
    const src = fakeSource(total)
    const out = await fetchAllPages(src.fetchPage, { keyOf: (r) => r.id })
    assert.equal(out.length, total)
    assert.deepEqual(out.map((r) => r.id), src.rows.map((r) => r.id))
    assert.equal(src.calls.length, expectedCalls)
    assert.deepEqual(src.calls[0], [0, PAGE_SIZE - 1])
    if (src.calls[1]) assert.deepEqual(src.calls[1], [PAGE_SIZE, 2 * PAGE_SIZE - 1])
  })
}

// ── G. pagination failure ────────────────────────────────────────────────────

test('G: 途中ページの error は throw（部分結果を返さない）', async () => {
  let n = 0
  const fetchPage = async () => (++n === 2 ? { data: null, error: { message: 'timeout' } } : { data: Array(PAGE_SIZE).fill({ id: 'x' }), error: null })
  await assert.rejects(fetchAllPages(fetchPage), /page 1 failed: timeout/)
})

test('G: data が配列でない / 応答なし / 例外も throw', async () => {
  await assert.rejects(fetchAllPages(async () => ({ data: null, error: null })), /no data array/)
  await assert.rejects(fetchAllPages(async () => null), /failed/)
  await assert.rejects(fetchAllPages(async () => { throw new Error('network down') }), /network down/)
})

test('G: maxPages 超過は throw（暴走防止）', async () => {
  const fetchPage = async () => ({ data: Array(PAGE_SIZE).fill(0).map((_, i) => ({ id: Math.random() + i })), error: null })
  await assert.rejects(fetchAllPages(fetchPage, { maxPages: 3 }), /exceeded 3 pages/)
})

// ── H. stable ordering assumptions ───────────────────────────────────────────

test('H: 決定的順序なら 2 回の取得結果は完全一致（ページ境界も同じ）', async () => {
  const src = fakeSource(2500)
  const a = await fetchAllPages(src.fetchPage, { keyOf: (r) => r.id })
  const b = await fetchAllPages(src.fetchPage, { keyOf: (r) => r.id })
  assert.deepEqual(a, b)
})

test('H: 取得中の先頭 INSERT でページ境界に重複が出ても keyOf で除去される', async () => {
  // DESC 順で 1 ページ目取得後に先頭へ 1 件挿入 → 1 ページ目末尾が 2 ページ目先頭に再出現する
  let rows = Array.from({ length: 1500 }, (_, i) => ({ id: `r${i}` }))
  let call = 0
  const fetchPage = async (from, to) => {
    const page = rows.slice(from, to + 1)
    if (++call === 1) rows = [{ id: 'new' }, ...rows]
    return { data: page, error: null }
  }
  const out = await fetchAllPages(fetchPage, { keyOf: (r) => r.id })
  const ids = out.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('r999') && ids.includes('r1000') && ids.includes('r1499'))
})

// ── I. actress canonical URL ─────────────────────────────────────────────────

test('I: 女優 URL は実ページ canonical（/verity/actresses/<external_id>）', () => {
  assert.equal(actressUrl(BASE, 'dmm-actress-1042596'), `${BASE}/verity/actresses/dmm-actress-1042596`)
  assert.notEqual(actressUrl(BASE, 'dmm-actress-1'), `${BASE}/actresses/dmm-actress-1`)
})

test('I: 作品/ニュース URL は canonical（/articles/<slug>, /news/<slug>）', () => {
  assert.equal(articleUrl(BASE, '--jur758'), `${BASE}/articles/--jur758`)
  assert.equal(newsUrl(BASE, 'ai-mida00671'), `${BASE}/news/ai-mida00671`)
})

// ── J. ranking canonical URL / static entries ─────────────────────────────────

test('J: static はランキングを canonical /ranking で載せ、/verity/ranking は載せない', () => {
  const locs = staticEntries(BASE, []).map((e) => e.loc)
  assert.ok(locs.includes(`${BASE}/ranking`))
  assert.ok(!locs.includes(`${BASE}/verity/ranking`))
})

test('J: static は承認 route を含み、除外 route（latest/taste）は含まない', () => {
  const spotlights = [
    { publicUrl: '/spotlight/aizawa-miyu' },
    { publicUrl: '/spotlight/satsuki-nao' },
    { publicUrl: '/spotlight/mens-esthe' },
  ]
  const locs = staticEntries(BASE, spotlights).map((e) => e.loc)
  for (const p of ['', '/actresses', '/news', '/verity/events', '/verity/events/tre2026', '/verity/features', '/verity/videos',
    '/verity/makers', '/verity/special/minamo', '/verity/lovedoll', '/verity/rankings/weekly',
    '/spotlight/aizawa-miyu', '/spotlight/satsuki-nao', '/spotlight/mens-esthe']) {
    assert.ok(locs.includes(`${BASE}${p}`), `missing ${p || '/'}`)
  }
  assert.ok(!locs.includes(`${BASE}/verity/latest`))
  assert.ok(!locs.includes(`${BASE}/verity/taste`))
  assert.equal(locs.length, 15)
})

// ── K. invalid month ─────────────────────────────────────────────────────────

test('K: parseArticleMonth は形式・範囲外を null（route で 404）', () => {
  assert.equal(parseArticleMonth('2026-10', NOW), '2026-10')
  assert.equal(parseArticleMonth('2007-02', NOW), '2007-02')
  for (const bad of [undefined, null, '', '2026-1', '2026-13', '2026-00', '26-10', '2026-10-01', '2026-10 ', 'abcd-ef', '2007-01', '2026-11', '2099-01']) {
    assert.equal(parseArticleMonth(bad, NOW), null, `expected null for ${JSON.stringify(bad)}`)
  }
})

// ── L. duplicate URL prevention ──────────────────────────────────────────────

test('L: urlset は同一 loc を先勝ちで 1 件に畳む', () => {
  const xml = buildUrlsetXml([
    { loc: `${BASE}/articles/a`, lastmod: '2026-01-01T00:00:00Z' },
    { loc: `${BASE}/articles/a`, lastmod: '2026-02-01T00:00:00Z' },
    { loc: `${BASE}/articles/b` },
  ])
  assert.equal((xml.match(/<url>/g) || []).length, 2)
  assert.ok(xml.includes('<lastmod>2026-01-01T00:00:00.000Z</lastmod>'))
})

test('L: static entries に重複 loc は無い', () => {
  const locs = staticEntries(BASE, [{ publicUrl: '/spotlight/aizawa-miyu' }]).map((e) => e.loc)
  assert.equal(new Set(locs).size, locs.length)
})
