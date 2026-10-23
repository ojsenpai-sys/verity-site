// scripts/__tests__/filter-options.test.mjs
// 実行: node --test scripts/__tests__/filter-options.test.mjs
//
// src/lib/filterOptions.mjs(トップページ getFilterOptions の集計と部分失敗の扱い)を対象とする。
// 回帰観点: 1クエリ失敗時に全項目が空になる後退をしない(取得できた項目は表示する)こと、
// かつ部分結果を共有キャッシュへ保存しないこと。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assembleFilterOptions,
  filterOptionsOrThrowPartial,
  takePartialFilterOptions,
} from '../../src/lib/filterOptions.mjs'

const ok = (data) => ({ data, error: null })
const ng = (message = 'boom') => ({ data: null, error: { message } })

const ACTRESSES = [
  { id: 2, name: '女優B', metadata: { monthly_rank: 2 } },
  { id: 1, name: '女優A', metadata: { monthly_rank: 1 } },
  { id: 3, name: '女優C', metadata: {} },
]
const ALL_OK = {
  cat: ok([{ category: 'ドラマ' }, { category: '巨乳' }, { category: 'ドラマ' }]),
  src: ok([{ source: 'dmm' }, { source: 'dmm' }]),
  tag: ok([{ tags: ['巨乳', '女優A', '単体作品'] }, { tags: ['巨乳', null] }, { tags: null }]),
  act: ok(ACTRESSES),
}

test('assembleFilterOptions: 全成功時は従来ロジックどおり集計する', () => {
  const { options, failed } = assembleFilterOptions(ALL_OK)
  assert.deepEqual(failed, [])
  assert.deepEqual(options.categories, ['ドラマ', '巨乳'])
  assert.deepEqual(options.sources, ['dmm'])
  // 女優名(女優A)はタグから除外、出現数降順
  assert.deepEqual(options.tags, ['巨乳', '単体作品'])
  // monthly_rank 昇順・未設定(9999)は末尾
  assert.deepEqual(options.actresses.map((a) => a.id), [1, 2, 3])
})

test('filterOptionsOrThrowPartial: 全成功なら値を返す(=キャッシュ対象)', () => {
  const options = filterOptionsOrThrowPartial(ALL_OK)
  assert.equal(options.categories.length, 2)
})

test('回帰: 1クエリ(タグ)失敗でも、他の項目(カテゴリ/ソース/女優)は空にならない', () => {
  let caught
  try { filterOptionsOrThrowPartial({ ...ALL_OK, tag: ng() }) } catch (e) { caught = e }
  const partial = takePartialFilterOptions(caught)
  assert.ok(partial, '部分失敗は部分結果付きで throw される')
  assert.deepEqual(partial.failed, ['tag'])
  assert.deepEqual(partial.options.categories, ['ドラマ', '巨乳'])
  assert.deepEqual(partial.options.sources, ['dmm'])
  assert.deepEqual(partial.options.actresses.map((a) => a.id), [1, 2, 3])
  assert.deepEqual(partial.options.tags, [])
})

test('回帰: 女優クエリ失敗時は女優名除外なしでタグを集計する(従来の data=null と同じ挙動)', () => {
  let caught
  try { filterOptionsOrThrowPartial({ ...ALL_OK, act: ng() }) } catch (e) { caught = e }
  const partial = takePartialFilterOptions(caught)
  assert.deepEqual(partial.failed, ['act'])
  assert.deepEqual(partial.options.actresses, [])
  assert.deepEqual(partial.options.tags, ['巨乳', '女優A', '単体作品'])
})

test('全クエリ失敗: 部分結果は全項目空(従来の空表示と同じ)', () => {
  let caught
  try { filterOptionsOrThrowPartial({ cat: ng(), src: ng(), tag: ng(), act: ng() }) } catch (e) { caught = e }
  const partial = takePartialFilterOptions(caught)
  assert.deepEqual(partial.failed, ['cat', 'src', 'tag', 'act'])
  assert.deepEqual(partial.options, { categories: [], sources: [], tags: [], actresses: [] })
})

test('takePartialFilterOptions: 通常の例外・非オブジェクトには null を返す', () => {
  assert.equal(takePartialFilterOptions(new Error('network')), null)
  assert.equal(takePartialFilterOptions(undefined), null)
  assert.equal(takePartialFilterOptions('x'), null)
})

test('部分結果マーカーは列挙されない(ログ出力等で部分データ全体が展開されない)', () => {
  let caught
  try { filterOptionsOrThrowPartial({ ...ALL_OK, cat: ng() }) } catch (e) { caught = e }
  assert.deepEqual(Object.keys(caught), [])
  assert.match(caught.message, /partial failure \(cat\)/)
})

// unstable_cache と同じく「成功値のみ保存・throw した結果は保存しない」偽キャッシュで通し確認。
function fakeCache(fn) {
  let stored = null
  return async () => {
    if (stored) return stored.value
    const value = await fn() // throw したら保存しない
    stored = { value }
    return value
  }
}
// page.tsx の getFilterOptions と同じ catch 分岐
async function getFilterOptionsLike(cached) {
  try {
    return { kind: 'cached-or-fresh', options: await cached() }
  } catch (err) {
    const partial = takePartialFilterOptions(err)
    if (partial) return { kind: 'partial', options: partial.options }
    return { kind: 'empty', options: { categories: [], sources: [], tags: [], actresses: [] } }
  }
}

test('通し: 部分失敗はそのリクエストだけ部分結果を返してキャッシュせず、次の全成功がキャッシュされる', async () => {
  const responses = [{ ...ALL_OK, src: ng() }, ALL_OK, { cat: ng(), src: ng(), tag: ng(), act: ng() }]
  let fetches = 0
  const cached = fakeCache(async () => filterOptionsOrThrowPartial(responses[fetches++]))

  const r1 = await getFilterOptionsLike(cached)
  assert.equal(r1.kind, 'partial')
  assert.deepEqual(r1.options.sources, [])
  assert.deepEqual(r1.options.categories, ['ドラマ', '巨乳'])

  const r2 = await getFilterOptionsLike(cached) // 部分結果が保存されていないので再取得される
  assert.equal(r2.kind, 'cached-or-fresh')
  assert.deepEqual(r2.options.sources, ['dmm'])

  const r3 = await getFilterOptionsLike(cached) // 完全な結果がキャッシュから返る(3番目の全失敗応答は使われない)
  assert.deepEqual(r3.options.sources, ['dmm'])
  assert.equal(fetches, 2)
})

test('通し: 通常の例外(ネットワーク等)は空表示へ縮退し、キャッシュされない', async () => {
  let fetches = 0
  const cached = fakeCache(async () => { fetches++; if (fetches === 1) throw new Error('fetch failed'); return filterOptionsOrThrowPartial(ALL_OK) })
  assert.equal((await getFilterOptionsLike(cached)).kind, 'empty')
  assert.equal((await getFilterOptionsLike(cached)).kind, 'cached-or-fresh')
  assert.equal(fetches, 2)
})
