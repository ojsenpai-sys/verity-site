// scripts/__tests__/video-discovery-selection.test.mjs
// 実行: node --test scripts/__tests__/video-discovery-selection.test.mjs
//
// src/lib/videoDiscoverySelection.mjs の pure 選定ロジック / 計測メタを対象とする。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isReleased,
  selectNewReleases,
  selectPopular,
  catalogMeta,
  fanzaPosition,
  dwellMs,
  MAX_PER_ROW,
} from '../../src/lib/videoDiscoverySelection.mjs'

const NOW = Date.parse('2026-10-04T12:00:00Z')
const URL = 'https://www.dmm.co.jp/litevideo/-/part/=/cid=x/size=720_480/'

function c(cid, over = {}) {
  return {
    cid,
    makerId: 'm1',
    floor: 'videoa',
    sampleMovieUrl: URL,
    publishedAt: '2026-10-01T00:00:00Z',
    fetchedAt: '2026-10-01T00:00:00Z',
    ...over,
  }
}

// ── isReleased ────────────────────────────────────────────────────────────────

test('isReleased: past/now は true、未来・欠損・不正は false', () => {
  assert.equal(isReleased('2026-10-04T12:00:00Z', NOW), true)
  assert.equal(isReleased('2026-10-01T00:00:00Z', NOW), true)
  assert.equal(isReleased('2026-10-05T00:00:00Z', NOW), false)
  assert.equal(isReleased(null, NOW), false)
  assert.equal(isReleased('not-a-date', NOW), false)
})

// ── NEW RELEASES ──────────────────────────────────────────────────────────────

test('NEW: sample なしを除外', () => {
  const out = selectNewReleases([c('a'), c('b', { sampleMovieUrl: null }), c('c', { sampleMovieUrl: '' })], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['a'])
})

test('NEW: dvd を除外', () => {
  const out = selectNewReleases([c('a', { floor: 'dvd' }), c('b')], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['b'])
})

test('NEW: 発売前（future）を除外', () => {
  const out = selectNewReleases([c('a', { publishedAt: '2026-10-30T00:00:00Z' }), c('b')], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['b'])
})

test('NEW: 重複 CID を除外', () => {
  const out = selectNewReleases([c('a', { makerId: 'm1' }), c('a', { makerId: 'm2' }), c('b', { makerId: 'm3' })], { nowMs: NOW })
  // 同着（発売日・fetched_at同一）は CID 降順
  assert.deepEqual(out.map(x => x.cid), ['b', 'a'])
  // 先勝ち（最初に現れた行を採用）
  assert.equal(out.find(x => x.cid === 'a').makerId, 'm1')
})

test('NEW: 1メーカー最大2本', () => {
  const out = selectNewReleases(
    [c('a1'), c('a2'), c('a3'), c('b1', { makerId: 'm2' })],
    { nowMs: NOW },
  )
  assert.equal(out.filter(x => x.makerId === 'm1').length, 2)
  assert.ok(out.some(x => x.cid === 'b1'))
  assert.equal(out.length, 3)
})

test('NEW: 最大6本', () => {
  const many = Array.from({ length: 20 }, (_, i) => c(`x${i}`, { makerId: `m${i}` }))
  assert.equal(selectNewReleases(many, { nowMs: NOW }).length, MAX_PER_ROW)
  assert.equal(MAX_PER_ROW, 6)
})

test('NEW: 発売日の新しい順（同着は fetched_at 降順）', () => {
  const out = selectNewReleases([
    c('old', { makerId: 'm1', publishedAt: '2026-09-01T00:00:00Z' }),
    c('new', { makerId: 'm2', publishedAt: '2026-10-03T00:00:00Z' }),
    c('mid_late_fetch', { makerId: 'm3', publishedAt: '2026-09-20T00:00:00Z', fetchedAt: '2026-09-21T00:00:00Z' }),
    c('mid_early_fetch', { makerId: 'm4', publishedAt: '2026-09-20T00:00:00Z', fetchedAt: '2026-09-10T00:00:00Z' }),
  ], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['new', 'mid_late_fetch', 'mid_early_fetch', 'old'])
})

test('NEW: 6本に満たなくても補充しない / 空入力は空', () => {
  assert.deepEqual(selectNewReleases([], { nowMs: NOW }), [])
  assert.deepEqual(selectNewReleases(null, { nowMs: NOW }), [])
  assert.equal(selectNewReleases([c('a'), c('b', { makerId: 'm2' })], { nowMs: NOW }).length, 2)
})

// ── POPULAR ON VERITY ─────────────────────────────────────────────────────────

test('POPULAR: sample なしを除外', () => {
  const out = selectPopular([c('a', { rank: 1, sampleMovieUrl: null }), c('b', { rank: 2 })], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['b'])
})

test('POPULAR: dvd / 発売前を除外', () => {
  const out = selectPopular([
    c('d', { rank: 1, floor: 'dvd' }),
    c('f', { rank: 2, publishedAt: '2026-11-01T00:00:00Z' }),
    c('ok', { rank: 3 }),
  ], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['ok'])
})

test('POPULAR: NEW との重複・自身の重複を除外', () => {
  const out = selectPopular(
    [c('a', { rank: 1 }), c('b', { rank: 2 }), c('b', { rank: 3 }), c('c', { rank: 4 })],
    { nowMs: NOW, excludeCids: ['a'] },
  )
  assert.deepEqual(out.map(x => x.cid), ['b', 'c'])
})

test('POPULAR: ランキング順を維持（入力順に依存しない）', () => {
  const out = selectPopular([c('r3', { rank: 3 }), c('r1', { rank: 1 }), c('r2', { rank: 2 })], { nowMs: NOW })
  assert.deepEqual(out.map(x => x.cid), ['r1', 'r2', 'r3'])
})

test('POPULAR: 最大6本（メーカー上限は適用しない）', () => {
  const many = Array.from({ length: 12 }, (_, i) => c(`p${i}`, { rank: i + 1 }))
  const out = selectPopular(many, { nowMs: NOW })
  assert.equal(out.length, 6)
  assert.deepEqual(out.map(x => x.cid), ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'])
})

// ── 計測メタ ──────────────────────────────────────────────────────────────────

test('catalogMeta: source/row/slot を返し cid・position は含めない', () => {
  assert.deepEqual(catalogMeta('new', 3), { source: 'video_discovery', row: 'new', slot: 3 })
  assert.equal('cid' in catalogMeta('popular', 1), false)
  // position は fanza_click の導線識別子。FanzaLink の meta 展開で上書きしないこと
  assert.equal('position' in catalogMeta('popular', 1), false)
})

test('FanzaLink 相当の合成で fanza_click の position が導線IDのまま残る', () => {
  const payload = { cid: 'x', position: fanzaPosition('new'), ...catalogMeta('new', 2) }
  assert.equal(payload.position, 'video_discovery_new')
  assert.equal(payload.slot, 2)
})

test('fanzaPosition: 行ごとの position', () => {
  assert.equal(fanzaPosition('new'), 'video_discovery_new')
  assert.equal(fanzaPosition('popular'), 'video_discovery_popular')
})

test('dwellMs: 差分(ms)・負値/非数は0', () => {
  assert.equal(dwellMs(1000, 4500), 3500)
  assert.equal(dwellMs(5000, 1000), 0)
  assert.equal(dwellMs(undefined, 1000), 0)
})
