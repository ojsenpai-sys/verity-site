// scripts/__tests__/fastest-releases-selection.test.mjs
// 実行: node --test scripts/__tests__/fastest-releases-selection.test.mjs
//
// src/lib/fastestReleasesSelection.mjs の pure 選定ロジック
// (pickDisplayFloor / isFuturePublished / selectFastestCards)を対象とする。
//
// 対象外(DB/SQL側の責務のためunit test対象外。Phase F-2調査で実データ確認済み):
//   - 「同一fetched_atの行が1つのbatchとしてグルーピングされる」こと自体
//     (MAX(fetched_at)取得→完全一致抽出はSQLクエリの責務)
//   - 「複数メーカーでMAX(fetched_at)最大のメーカーが最上位になる」こと自体
//     (メーカー間ソートはfastestReleases.ts側の配列sortで、DBから返る
//      updateDateKeyの値を信頼して比較するのみ)
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickDisplayFloor, isFuturePublished, selectFastestCards } from '../../src/lib/fastestReleasesSelection.mjs'

const NOW = '2026-08-18T00:00:00.000+00:00'

// ── pickDisplayFloor ────────────────────────────────────────────────────────
test('pickDisplayFloor: videoa行が1件でもあればvideoaを選ぶ(dvdは無視)', () => {
  const rows = [{ floor: 'dvd' }, { floor: 'videoa' }, { floor: 'dvd' }]
  assert.equal(pickDisplayFloor(rows), 'videoa')
})
test('pickDisplayFloor: videoaが0件ならdvdをフォールバックとして選ぶ', () => {
  const rows = [{ floor: 'dvd' }, { floor: 'dvd' }]
  assert.equal(pickDisplayFloor(rows), 'dvd')
})
test('pickDisplayFloor: どちらも無ければnull', () => {
  assert.equal(pickDisplayFloor([]), null)
})

// ── isFuturePublished ───────────────────────────────────────────────────────
test('isFuturePublished: 現在時刻以降(未来)はtrue', () => {
  assert.equal(isFuturePublished('2026-09-09T15:00:00+00:00', NOW), true)
  assert.equal(isFuturePublished(NOW, NOW), true) // ちょうど現在時刻も未来扱い(>=)
})
test('isFuturePublished: 過去はfalse、nullもfalse', () => {
  assert.equal(isFuturePublished('2026-08-13T15:00:00+00:00', NOW), false)
  assert.equal(isFuturePublished(null, NOW), false)
})

// ── selectFastestCards: floor優先(既存提案 2,3,12) ────────────────────────
test('videoa存在時はvideoaのみ選定される(dvdは混在しない)', () => {
  const rows = [
    { external_id: 'dvd1', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'v1', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['v1'])
})
test('videoaが0件のときのみdvdがフォールバックとして選定される', () => {
  const rows = [
    { external_id: 'dvd1', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'dvd2', floor: 'dvd', published_at: '2026-08-11T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id).sort(), ['dvd1', 'dvd2'])
})
test('floor組み合わせが両方とも成立する(同一呼び出しで独立に判定)', () => {
  const withVideoa = [
    { external_id: 'v1', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'dvd1', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const dvdOnly = [
    { external_id: 'dvd2', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  assert.deepEqual(selectFastestCards(withVideoa, NOW, 10).map((r) => r.external_id), ['v1'])
  assert.deepEqual(selectFastestCards(dvdOnly, NOW, 10).map((r) => r.external_id), ['dvd2'])
})

// ── selectFastestCards: published_atはフィルタではなく整理(既存提案5,6 + 新規8,9,10,11) ──
test('未来作品は除外されない。現在に近い未来から昇順で並ぶ(ケース8,10)', () => {
  const rows = [
    { external_id: 'far', floor: 'videoa', published_at: '2026-12-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'near', floor: 'videoa', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mid', floor: 'videoa', published_at: '2026-09-01T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['near', 'mid', 'far']) // 遠い未来が先に来ない
})
test('未来作品が過去作品より優先され、未来作品だけで足りる場合は過去作品を含めない(ケース6)', () => {
  const rows = [
    { external_id: 'future1', floor: 'videoa', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'past1', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 1)
  assert.deepEqual(result.map((r) => r.external_id), ['future1'])
})
test('未来作品が limit 未満の場合、過去作品を published_at 降順(新しい順)で補完する(ケース9)', () => {
  const rows = [
    { external_id: 'future1', floor: 'videoa', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'past_old', floor: 'videoa', published_at: '2026-08-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'past_new', floor: 'videoa', published_at: '2026-08-13T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['future1', 'past_new', 'past_old'])
})
test('取得漏れの遠い過去作品が同一batchに混在しても、現在に近い新作が優先される(ケース11)', () => {
  const rows = [
    { external_id: 'stale_old', floor: 'videoa', published_at: '2026-01-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'near_future', floor: 'videoa', published_at: '2026-08-19T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'recent_past', floor: 'videoa', published_at: '2026-08-17T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 2)
  assert.deepEqual(result.map((r) => r.external_id), ['near_future', 'recent_past'])
})
test('published_atがnullの行は除外される', () => {
  const rows = [
    { external_id: 'a', floor: 'videoa', published_at: null, fetched_at: NOW },
    { external_id: 'b', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['b'])
})
test('MOODYZ実データ相当: 全て未来予約(9月配信)でも除外されず現在に近い順で選定される', () => {
  const rows = [
    { external_id: 'mihd00010', floor: 'videoa', published_at: '2026-09-09T15:00:00+00:00', fetched_at: NOW },
    { external_id: 'mive00001', floor: 'videoa', published_at: '2026-08-31T15:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['mive00001', 'mihd00010']) // 近い方が先
})
test('limitを超える件数がある場合は先頭からlimit件のみ返す', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    external_id: `c${i}`,
    floor: 'videoa',
    published_at: `2026-08-${String(10 + i).padStart(2, '0')}T00:00:00+00:00`,
    fetched_at: NOW,
  }))
  const result = selectFastestCards(rows, NOW, 10)
  assert.equal(result.length, 10)
})
test('候補が0件なら空配列(floorが存在しない場合)', () => {
  assert.deepEqual(selectFastestCards([], NOW, 10), [])
})
