// 実行: node --test src/lib/__tests__/worksRanking.test.ts
//
// Phase RANK-2b: 公開ランキング読み取りを works_ranking_cache 経由へ切り替えた際の
// 回帰防止テスト。DB非依存の純粋ロジック（mergeRankedRows/clampToCacheDepth）と、
// 「公開経路が高コストRPC get_top_works_ranked を直接呼んでいないこと」を保証する
// リポジトリ不変条件（ソースを読んでパターン検査）の2種類で構成する
// （既存の scripts/__tests__ の慣習に合わせ node:test を使用）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mergeRankedRows, clampToCacheDepth, WORKS_RANKING_CACHE_DEPTH } from '../worksRankingCore.ts'
import type { Article } from '../types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')

function readSrc(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}

function fakeArticle(overrides: Partial<Article> & { external_id: string }): Article {
  return {
    id: overrides.external_id,
    title: `title-${overrides.external_id}`,
    slug: overrides.external_id,
    source: 'dmm',
    category: null,
    tags: null,
    summary: null,
    content: null,
    image_url: null,
    published_at: null,
    fetched_at: new Date().toISOString(),
    metadata: null,
    is_active: true,
    ...overrides,
  }
}

// ── 1. cache reader が期待する形（mergeRankedRows）を返す ──────────────────────
test('mergeRankedRows: cache行とarticlesを突合し rank/points/article を持つ配列を返す', () => {
  const rows = [
    { external_id: 'a1', points: 100.5 },
    { external_id: 'a2', points: 80.2 },
  ]
  const map = new Map([
    ['a1', fakeArticle({ external_id: 'a1' })],
    ['a2', fakeArticle({ external_id: 'a2' })],
  ])
  const result = mergeRankedRows(rows, map)
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(r => r.rank), [1, 2])
  assert.deepEqual(result.map(r => r.points), [100.5, 80.2])
  assert.equal(result[0].article.external_id, 'a1')
  assert.equal(result[1].article.external_id, 'a2')
})

test('mergeRankedRows: 順序（cache行の並び= points DESC由来）をそのまま保持する', () => {
  const rows = [
    { external_id: 'hi', points: 999 },
    { external_id: 'mid', points: 500 },
    { external_id: 'lo', points: 1 },
  ]
  const map = new Map([
    ['hi', fakeArticle({ external_id: 'hi' })],
    ['mid', fakeArticle({ external_id: 'mid' })],
    ['lo', fakeArticle({ external_id: 'lo' })],
  ])
  const result = mergeRankedRows(rows, map)
  assert.deepEqual(result.map(r => r.article.external_id), ['hi', 'mid', 'lo'])
  assert.deepEqual(result.map(r => r.rank), [1, 2, 3])
})

test('mergeRankedRows: articleが見つからない行は除外し、rankを1から振り直す（欠番を作らない）', () => {
  const rows = [
    { external_id: 'keep1', points: 90 },
    { external_id: 'missing', points: 85 }, // is_active=false等でarticles結果に含まれない想定
    { external_id: 'keep2', points: 80 },
  ]
  const map = new Map([
    ['keep1', fakeArticle({ external_id: 'keep1' })],
    ['keep2', fakeArticle({ external_id: 'keep2' })],
  ])
  const result = mergeRankedRows(rows, map)
  assert.equal(result.length, 2)
  assert.deepEqual(result.map(r => r.article.external_id), ['keep1', 'keep2'])
  assert.deepEqual(result.map(r => r.rank), [1, 2]) // 欠番(2)を飛ばさず詰める
})

// ── 2. limit挙動（クランプ） ────────────────────────────────────────────────────
test('clampToCacheDepth: cache深度以下のlimitはそのまま', () => {
  assert.equal(clampToCacheDepth(10), 10)
  assert.equal(clampToCacheDepth(1), 1)
  assert.equal(clampToCacheDepth(WORKS_RANKING_CACHE_DEPTH), WORKS_RANKING_CACHE_DEPTH)
})

test('clampToCacheDepth: cache深度を超えるlimitはcache深度に丸められる', () => {
  assert.equal(clampToCacheDepth(1000), WORKS_RANKING_CACHE_DEPTH)
  assert.equal(clampToCacheDepth(WORKS_RANKING_CACHE_DEPTH + 1), WORKS_RANKING_CACHE_DEPTH)
})

// ── 3. 空cache挙動 ──────────────────────────────────────────────────────────────
test('mergeRankedRows: 空行配列に対しては空配列を返す（グレースフル劣化）', () => {
  assert.deepEqual(mergeRankedRows([], new Map()), [])
})

test('mergeRankedRows: 全行のarticleが見つからない場合も空配列を返す', () => {
  const rows = [{ external_id: 'gone', points: 50 }]
  assert.deepEqual(mergeRankedRows(rows, new Map()), [])
})

// ── 4. DB/読み取り失敗時のフォールバックは getTopRankedWorks() 側のtry/catchが担う ──
// (実ネットワーク呼び出しを伴うため、ここでは実装がその形を保っていることをソース検査で確認する)
test('getTopRankedWorks: 例外を握りつぶし空配列へフォールバックする実装のままである', () => {
  const src = readSrc('src/lib/worksRanking.ts')
  assert.match(
    src,
    /export async function getTopRankedWorks[\s\S]*?catch[\s\S]*?return \[\]/,
    'getTopRankedWorks must catch errors and fall back to an empty array',
  )
})

// ── 5. /verity/ranking が高コストRPCを直接呼ばなくなっていること（回帰防止） ──────
test('ranking/page.tsx: get_top_works_ranked RPCを直接呼び出していない', () => {
  const src = readSrc('src/app/verity/ranking/page.tsx')
  assert.doesNotMatch(src, /\.rpc\(\s*['"]get_top_works_ranked['"]/)
  assert.match(src, /getTopRankedWorks\(/, 'ranking page must use the canonical reader')
})

test('worksRanking.ts: 公開読み取り経路(fetchTopRankedWorksRaw)はRPCではなくworks_ranking_cacheを読む', () => {
  const src = readSrc('src/lib/worksRanking.ts')
  assert.doesNotMatch(src, /\.rpc\(\s*['"]get_top_works_ranked['"]/)
  assert.match(src, /\.from\(\s*['"]works_ranking_cache['"]/)
})

// ── 6/7. Hero・admin-social-posts が canonical reader 経由のままであること ────────
test('HeroV21Section.tsx / HeroSection.tsx: getTopRankedWorksを介してのみランキングを取得する', () => {
  for (const file of ['src/components/HeroV21Section.tsx', 'src/components/HeroSection.tsx']) {
    const src = readSrc(file)
    assert.doesNotMatch(src, /\.rpc\(\s*['"]get_top_works_ranked['"]/, `${file} must not call the RPC directly`)
    assert.match(src, /getTopRankedWorks/, `${file} must use the canonical reader`)
  }
})

test('admin-social-posts.ts: getTopRankedWorksを介してのみランキングを取得する', () => {
  const src = readSrc('src/app/verity/actions/admin-social-posts.ts')
  assert.doesNotMatch(src, /\.rpc\(\s*['"]get_top_works_ranked['"]/)
  assert.match(src, /getTopRankedWorks\(/)
})
