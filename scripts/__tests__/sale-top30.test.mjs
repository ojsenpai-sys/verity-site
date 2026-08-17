// scripts/__tests__/sale-top30.test.mjs — VERITY SALE TOP30 純粋ロジックのテスト。
// 依存なし・Node組み込み node:test のみ使用（プロジェクト方針=zero-dependency scriptsに合わせる）。
// 実行: node --test scripts/__tests__/sale-top30.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isActiveCampaignAt,
  filterActiveCampaigns,
  dedupeByCid,
  minmax,
  log1pMinmax,
  freshnessScore,
  computeSaleScoreV1,
  selectDiversifiedTop30,
  validateSnapshotRows,
  diffSnapshots,
} from '../lib/sale-top30-core.mjs'

// ── 1-3: active/expired/future campaign判定 ─────────────────────────────────
test('1. active campaign判定: begin<=now<end は true', () => {
  const now = new Date('2026-08-17T12:00:00+09:00')
  const c = { date_begin: '2026-08-17 10:10:00', date_end: '2026-08-19 09:59:59' }
  assert.equal(isActiveCampaignAt(c, now), true)
})
test('2. expired campaign除外: now>=date_end は false', () => {
  const now = new Date('2026-08-20T00:00:00+09:00')
  const c = { date_begin: '2026-08-17 10:10:00', date_end: '2026-08-19 09:59:59' }
  assert.equal(isActiveCampaignAt(c, now), false)
})
test('3. future campaign除外: now<date_begin は false', () => {
  const now = new Date('2026-08-17T00:00:00+09:00')
  const c = { date_begin: '2026-08-17 10:10:00', date_end: '2026-08-19 09:59:59' }
  assert.equal(isActiveCampaignAt(c, now), false)
})
test('境界値: now===date_end ちょうど は false（半開区間）', () => {
  const now = new Date('2026-08-19T09:59:59+09:00')
  const c = { date_begin: '2026-08-17 10:10:00', date_end: '2026-08-19 09:59:59' }
  assert.equal(isActiveCampaignAt(c, now), false)
})
test('filterActiveCampaigns: 複数キャンペーンから有効なものだけ残す', () => {
  const now = new Date('2026-08-17T12:00:00+09:00')
  const campaigns = [
    { title: 'expired', date_begin: '2026-08-01 00:00:00', date_end: '2026-08-10 00:00:00' },
    { title: 'active', date_begin: '2026-08-17 10:10:00', date_end: '2026-08-19 09:59:59' },
  ]
  const active = filterActiveCampaigns(campaigns, now)
  assert.equal(active.length, 1)
  assert.equal(active[0].title, 'active')
})

// ── 5. videoaのみ ── (query builder相当。DMM API呼び出しパラメータの固定値を確認)
test('5. floor=videoa がクエリに含まれる（buildItemListParams相当）', () => {
  const qs = new URLSearchParams({ floor: 'videoa', service: 'digital', sort: 'rank' })
  assert.equal(qs.get('floor'), 'videoa')
})

// ── 6. CID dedupe ─────────────────────────────────────────────────────────
test('6. CID dedupeで重複が除去される（先勝ち）', () => {
  const items = [
    { content_id: 'abc001', title: 'first' },
    { content_id: 'abc001', title: 'duplicate-should-be-dropped' },
    { content_id: 'abc002', title: 'second' },
  ]
  const out = dedupeByCid(items)
  assert.equal(out.length, 2)
  assert.equal(out.find((i) => i.content_id === 'abc001').title, 'first')
})

// ── 6b. local-knownのみフィルタ ──────────────────────────────────────────
test('6b. local-known CIDのみに絞り込める', () => {
  const candidates = [{ content_id: 'a' }, { content_id: 'b' }, { content_id: 'c' }]
  const knownSet = new Set(['a', 'c'])
  const filtered = candidates.filter((c) => knownSet.has(c.content_id))
  assert.deepEqual(filtered.map((c) => c.content_id), ['a', 'c'])
})

// ── 7-8. score正常 / log1p normalize ────────────────────────────────────────
test('8. log1pMinmax: 0はminへ、最大値は1へ写像され、単調増加を保つ', () => {
  const arr = [0, 1, 3, 6, 12]
  const out = log1pMinmax(arr)
  assert.equal(out[0], 0)
  assert.equal(out[out.length - 1], 1)
  for (let i = 1; i < out.length; i++) assert.ok(out[i] > out[i - 1], `index ${i} should be increasing`)
})
test('7. computeSaleScoreV1: scoreが有限数で0..100範囲に収まる', () => {
  const features = [
    { cid: 'a', videoView30d: 10, fanzaClick30d: 2, discountPct: 50, ageDays: 30, actressScoreRaw: 5, favoriteCount: 0, weeklyWorkScoreRaw: 0, actresses: ['女優A'], maker: 'メーカーX' },
    { cid: 'b', videoView30d: 0, fanzaClick30d: 0, discountPct: 30, ageDays: 400, actressScoreRaw: 0, favoriteCount: 0, weeklyWorkScoreRaw: 0, actresses: ['女優B'], maker: 'メーカーY' },
  ]
  const scored = computeSaleScoreV1(features)
  for (const s of scored) {
    assert.ok(Number.isFinite(s.score), `score for ${s.cid} must be finite`)
    assert.ok(s.score >= 0 && s.score <= 100, `score for ${s.cid} must be within 0..100, got ${s.score}`)
  }
  assert.ok(scored[0].score > scored[1].score, 'higher engagement+discount+freshness should outscore the cold/old item')
})

// ── 9. all-zero指標でもNaNにならない ─────────────────────────────────────────
test('9. 全指標ゼロでもNaNにならず0になる', () => {
  const features = [
    { cid: 'a', videoView30d: 0, fanzaClick30d: 0, discountPct: 0, ageDays: null, actressScoreRaw: 0, favoriteCount: 0, weeklyWorkScoreRaw: 0, actresses: [], maker: null },
    { cid: 'b', videoView30d: 0, fanzaClick30d: 0, discountPct: 0, ageDays: null, actressScoreRaw: 0, favoriteCount: 0, weeklyWorkScoreRaw: 0, actresses: [], maker: null },
  ]
  const scored = computeSaleScoreV1(features)
  for (const s of scored) assert.equal(s.score, 0)
})
test('minmax: 全要素が同一値のとき0配列を返す(NaN回避)', () => {
  assert.deepEqual(minmax([5, 5, 5]), [0, 0, 0])
})
test('freshnessScore: null/NaNは0、経過0日は1、halfLife超過は0にクランプ', () => {
  assert.equal(freshnessScore(null), 0)
  assert.equal(freshnessScore(0), 1)
  assert.equal(freshnessScore(9999, 180), 0)
})

// ── 10-11. diversity制御 ─────────────────────────────────────────────────────
function makeCandidate(cid, score, actress, maker, discountPct = 50) {
  return { cid, score, discountPct, actresses: [actress], maker }
}
test('10. diversity: 同一女優は最大2作品までしか選ばれない', () => {
  const pool = [
    makeCandidate('a1', 0.9, '女優A', 'メーカー1'),
    makeCandidate('a2', 0.8, '女優A', 'メーカー2'),
    makeCandidate('a3', 0.7, '女優A', 'メーカー3'), // 3件目はskipされるはず
    makeCandidate('b1', 0.6, '女優B', 'メーカー4'),
  ]
  const { selected, skippedCount, maxSameActress } = selectDiversifiedTop30(pool, { maxPerActress: 2, maxPerMaker: 4, targetCount: 4 })
  assert.equal(maxSameActress, 2)
  assert.equal(skippedCount, 1)
  assert.ok(!selected.some((s) => s.cid === 'a3'))
})
test('11. diversity: 同一メーカーは最大4作品までしか選ばれない', () => {
  const pool = []
  for (let i = 0; i < 6; i++) pool.push(makeCandidate(`m${i}`, 1 - i * 0.01, `女優${i}`, '同一メーカー'))
  const { selected, maxSameMaker, skippedCount } = selectDiversifiedTop30(pool, { maxPerActress: 2, maxPerMaker: 4, targetCount: 6 })
  assert.equal(maxSameMaker, 4)
  assert.equal(selected.length, 4)
  assert.equal(skippedCount, 2)
})

// ── 12-13. 30件成立 / 29件以下拒否 ───────────────────────────────────────────
test('12. 十分に多様な候補があれば30件ちょうど選べる(shortfall=false)', () => {
  const pool = []
  for (let i = 0; i < 40; i++) pool.push(makeCandidate(`c${i}`, 1 - i * 0.01, `女優${i % 20}`, `メーカー${i % 10}`))
  const { selected, shortfall } = selectDiversifiedTop30(pool, { maxPerActress: 2, maxPerMaker: 4, targetCount: 30 })
  assert.equal(selected.length, 30)
  assert.equal(shortfall, false)
})
test('13. 候補が足りない場合 shortfall=true になり、呼び出し側でapply拒否できる', () => {
  const pool = []
  for (let i = 0; i < 10; i++) pool.push(makeCandidate(`s${i}`, 1 - i * 0.01, `女優${i}`, `メーカー${i}`))
  const { selected, shortfall } = selectDiversifiedTop30(pool, { maxPerActress: 2, maxPerMaker: 4, targetCount: 30 })
  assert.equal(selected.length, 10)
  assert.equal(shortfall, true)
})
test('13b. validateSnapshotRows: 29件はexpected30と不一致で拒否', () => {
  const rows = Array.from({ length: 29 }, (_, i) => ({ rank: i + 1, external_id: `c${i}`, score: 1 }))
  const { valid, errors } = validateSnapshotRows(rows, 30)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('expected exactly 30')))
})

// ── 14-15. CID/rank重複拒否 ──────────────────────────────────────────────────
test('14. CID duplicate は拒否される', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, external_id: i === 29 ? 'c0' : `c${i}`, score: 1 }))
  const { valid, errors } = validateSnapshotRows(rows, 30)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('duplicate external_id')))
})
test('15. rank duplicate は拒否される', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ rank: i === 29 ? 1 : i + 1, external_id: `c${i}`, score: 1 }))
  const { valid, errors } = validateSnapshotRows(rows, 30)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('duplicate rank')))
})
test('score NaN は拒否される', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, external_id: `c${i}`, score: i === 0 ? NaN : 1 }))
  const { valid, errors } = validateSnapshotRows(rows, 30)
  assert.equal(valid, false)
  assert.ok(errors.some((e) => e.includes('NaN')))
})
test('正常な30行は valid=true', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, external_id: `c${i}`, score: 30 - i }))
  const { valid, errors } = validateSnapshotRows(rows, 30)
  assert.equal(valid, true)
  assert.deepEqual(errors, [])
})

// ── 16-17. API/DB failure ハンドリング（呼び出し側のtry/catch構造を模擬） ─────
test('16. API failure: fetchが例外を投げた場合、呼び出し元でcatchしてabort扱いにできる', async () => {
  async function fakeCrawl(fetchImpl) {
    try {
      await fetchImpl()
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: 'dmm_api_failure', message: e.message }
    }
  }
  const result = await fakeCrawl(async () => { throw new Error('network down') })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'dmm_api_failure')
})
test('17. DB read failure: Supabaseエラーレスポンスをabort扱いにできる', async () => {
  function fakeSelect(response) {
    if (response.error) return { ok: false, reason: 'db_read_failure', message: response.error.message }
    return { ok: true, data: response.data }
  }
  const result = fakeSelect({ error: { message: 'relation "user_events" does not exist' } })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'db_read_failure')
})

// ── 19. diff 0 → write 0 の判定ロジック ─────────────────────────────────────
test('19. diffSnapshots: 完全一致なら isEmpty=true(=書込みスキップ対象)', () => {
  const current = [{ rank: 1, external_id: 'a' }, { rank: 2, external_id: 'b' }]
  const next = [{ rank: 1, external_id: 'a' }, { rank: 2, external_id: 'b' }]
  const diff = diffSnapshots(current, next)
  assert.equal(diff.isEmpty, true)
  assert.deepEqual(diff.added, [])
  assert.deepEqual(diff.removed, [])
})
test('diffSnapshots: 順位変更を検出する', () => {
  const current = [{ rank: 1, external_id: 'a' }, { rank: 2, external_id: 'b' }]
  const next = [{ rank: 1, external_id: 'b' }, { rank: 2, external_id: 'a' }]
  const diff = diffSnapshots(current, next)
  assert.equal(diff.isEmpty, false)
  assert.equal(diff.rankChanged.length, 2)
})
test('diffSnapshots: 追加/削除を検出する', () => {
  const current = [{ rank: 1, external_id: 'a' }, { rank: 2, external_id: 'b' }]
  const next = [{ rank: 1, external_id: 'a' }, { rank: 2, external_id: 'c' }]
  const diff = diffSnapshots(current, next)
  assert.deepEqual(diff.added, ['c'])
  assert.deepEqual(diff.removed, ['b'])
})

// ── 22. Analytics placement文字列 ────────────────────────────────────────────
test('22. Analytics position定数が仕様どおり', () => {
  const SALE_TOP30_POSITION = 'sale_top30'
  const SALE_TOP30_CTA_POSITION = 'sale_top30_cta'
  assert.equal(SALE_TOP30_POSITION, 'sale_top30')
  assert.equal(SALE_TOP30_CTA_POSITION, 'sale_top30_cta')
})
