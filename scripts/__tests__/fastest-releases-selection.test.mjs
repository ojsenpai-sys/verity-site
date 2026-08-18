// scripts/__tests__/fastest-releases-selection.test.mjs
// 実行: node --test scripts/__tests__/fastest-releases-selection.test.mjs
//
// src/lib/fastestReleasesSelection.mjs の pure 選定ロジック(isReleasedByNow /
// compareByPublishedThenFetched / selectReleasedRows)を対象とする。
import test from 'node:test'
import assert from 'node:assert/strict'
import { isReleasedByNow, compareByPublishedThenFetched, selectReleasedRows } from '../../src/lib/fastestReleasesSelection.mjs'

const NOW = '2026-08-18T00:00:00.000+00:00'

test('isReleasedByNow: 未来の published_at は false(除外)', () => {
  assert.equal(isReleasedByNow('2026-09-09T15:00:00+00:00', NOW), false)
})
test('isReleasedByNow: 過去/現在時刻以前の published_at は true(採用)', () => {
  assert.equal(isReleasedByNow('2026-08-13T15:00:00+00:00', NOW), true)
  assert.equal(isReleasedByNow(NOW, NOW), true) // ちょうど現在時刻も採用(<=)
})
test('isReleasedByNow: published_at が null なら false(除外)', () => {
  assert.equal(isReleasedByNow(null, NOW), false)
})

test('compareByPublishedThenFetched: published_at 降順', () => {
  const a = { published_at: '2026-08-14T00:00:00+00:00', fetched_at: '2026-08-01T00:00:00+00:00' }
  const b = { published_at: '2026-08-10T00:00:00+00:00', fetched_at: '2026-08-15T00:00:00+00:00' }
  assert.ok(compareByPublishedThenFetched(a, b) < 0) // aが先(published_atが新しい)
})
test('compareByPublishedThenFetched: 同一published_atはfetched_at降順でタイブレーク', () => {
  const a = { published_at: '2026-08-14T00:00:00+00:00', fetched_at: '2026-08-15T00:00:00+00:00' }
  const b = { published_at: '2026-08-14T00:00:00+00:00', fetched_at: '2026-07-20T00:00:00+00:00' }
  assert.ok(compareByPublishedThenFetched(a, b) < 0) // aが先(fetched_atが新しい)
})

test('selectReleasedRows: MOODYZ実データ相当 — 未来予約作は除外され配信済みが published_at 降順で並ぶ', () => {
  const rows = [
    // 予約商品(2026-09-09配信予定) — fetched_atは新しいが除外されるべき
    { external_id: 'mihd00010', published_at: '2026-09-09T15:00:00+00:00', fetched_at: '2026-08-13T15:30:14+00:00' },
    { external_id: 'mihd00014', published_at: '2026-09-09T15:00:00+00:00', fetched_at: '2026-08-13T15:30:14+00:00' },
    // 配信済み(2026-08-14配信) — fetched_atは古いが採用され先頭に来るべき
    { external_id: 'mikr00117', published_at: '2026-08-13T15:00:59+00:00', fetched_at: '2026-07-20T15:30:14+00:00' },
    { external_id: 'mida00746', published_at: '2026-08-13T15:00:56+00:00', fetched_at: '2026-07-20T15:30:14+00:00' },
  ]
  const result = selectReleasedRows(rows, NOW)
  assert.deepEqual(result.map((r) => r.external_id), ['mikr00117', 'mida00746'])
})

test('selectReleasedRows: published_atがnullの行は除外', () => {
  const rows = [
    { external_id: 'a', published_at: null, fetched_at: '2026-08-01T00:00:00+00:00' },
    { external_id: 'b', published_at: '2026-08-10T00:00:00+00:00', fetched_at: '2026-08-01T00:00:00+00:00' },
  ]
  const result = selectReleasedRows(rows, NOW)
  assert.deepEqual(result.map((r) => r.external_id), ['b'])
})

test('selectReleasedRows: 全て未来予約なら空配列(フォールバックへ委ねる想定)', () => {
  const rows = [
    { external_id: 'a', published_at: '2026-09-01T00:00:00+00:00', fetched_at: '2026-08-01T00:00:00+00:00' },
  ]
  assert.deepEqual(selectReleasedRows(rows, NOW), [])
})
