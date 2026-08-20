// scripts/__tests__/audience-v3-from-snapshot.test.mjs
// Phase G-2: Audience v3 が kpi_daily_snapshot(最新行)を正本にすることの検証。
// node --test scripts/__tests__/audience-v3-from-snapshot.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audienceV3FromSnapshot } from '../../src/lib/audienceV3FromSnapshot.mjs'

test('snapshotに実DAU/WAU/MAUがあればそのまま返す', () => {
  const r = audienceV3FromSnapshot({ audience_v3_dau: 120, audience_v3_wau: 900, audience_v3_mau: 3091 })
  assert.deepEqual(r, { dau: 120, wau: 900, mau: 3091 })
})

test('snapshot行が存在しない(undefined)場合はnull(取得失敗と0件を区別)', () => {
  assert.equal(audienceV3FromSnapshot(undefined), null)
})

test('v3列が未計算(null)の日はnull(0と誤認させない)', () => {
  const r = audienceV3FromSnapshot({ audience_v3_dau: null, audience_v3_wau: null, audience_v3_mau: null })
  assert.equal(r, null)
})

test('一部の列だけnullでもnull(部分データでの誤表示を防ぐ)', () => {
  const r = audienceV3FromSnapshot({ audience_v3_dau: 10, audience_v3_wau: null, audience_v3_mau: 3091 })
  assert.equal(r, null)
})

test('実際に0件のケースはnullではなく{dau:0,wau:0,mau:0}を返す(取得失敗と区別できる)', () => {
  const r = audienceV3FromSnapshot({ audience_v3_dau: 0, audience_v3_wau: 0, audience_v3_mau: 0 })
  assert.deepEqual(r, { dau: 0, wau: 0, mau: 0 })
})

test('KPI Trend表の最新行と同一値を返す(データソース統一の検証)', () => {
  const kpiTrend = [
    { snapshot_date: '2026-08-20', audience_v3_dau: 55, audience_v3_wau: 620, audience_v3_mau: 3091 },
    { snapshot_date: '2026-08-19', audience_v3_dau: 51, audience_v3_wau: 611, audience_v3_mau: 3071 },
  ]
  const audienceV3 = audienceV3FromSnapshot(kpiTrend[0])
  assert.deepEqual(audienceV3, {
    dau: kpiTrend[0].audience_v3_dau,
    wau: kpiTrend[0].audience_v3_wau,
    mau: kpiTrend[0].audience_v3_mau,
  })
})
