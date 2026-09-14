// 実行: node --test src/lib/taste/__tests__/candidate-selection.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { selectDiagnosisSet } from '../candidate-selection.ts'
import { candidate, actress } from './fixtures.ts'

function seq(rng0: number[]): () => number {
  let i = 0
  return () => rng0[i++ % rng0.length]
}

test('20件未満の候補プールでは、取得できるだけ返す（0件クラッシュしない）', () => {
  const pool = [candidate({ externalId: 'a1', actress: [actress(1, '女優A')] })]
  const result = selectDiagnosisSet(pool, { count: 20, rng: seq([0]) })
  assert.equal(result.length, 1)
})

test('空プールでは空配列を返す', () => {
  const result = selectDiagnosisSet([], { count: 20 })
  assert.deepEqual(result, [])
})

test('actress欠損の候補は無効として除外する', () => {
  const pool = [
    candidate({ externalId: 'noactress', actress: [] }),
    candidate({ externalId: 'ok', actress: [actress(1, '女優A')] }),
  ]
  const result = selectDiagnosisSet(pool, { count: 20 })
  assert.deepEqual(result.map(c => c.externalId), ['ok'])
})

test('画像URL欠損の候補は無効として除外する', () => {
  const pool = [
    candidate({ externalId: 'noimg', imageUrl: null, actress: [actress(1, '女優A')] }),
    candidate({ externalId: 'ok', actress: [actress(2, '女優B')] }),
  ]
  const result = selectDiagnosisSet(pool, { count: 20 })
  assert.deepEqual(result.map(c => c.externalId), ['ok'])
})

test('重複external_idは1件に集約される', () => {
  const pool = [
    candidate({ externalId: 'dup', actress: [actress(1, '女優A')] }),
    candidate({ externalId: 'dup', actress: [actress(1, '女優A')] }),
  ]
  const result = selectDiagnosisSet(pool, { count: 20 })
  assert.equal(result.length, 1)
})

test('excludeExternalIdsに含まれる作品は出題しない（再診断時の重複回避）', () => {
  const pool = [
    candidate({ externalId: 'seen', actress: [actress(1, '女優A')] }),
    candidate({ externalId: 'fresh', actress: [actress(2, '女優B')] }),
  ]
  const result = selectDiagnosisSet(pool, { count: 20, excludeExternalIds: new Set(['seen']) })
  assert.deepEqual(result.map(c => c.externalId), ['fresh'])
})

test('多様な代替候補が十分ある場合、同一女優はmaxPerActressを超えて選ばれない', () => {
  // 女優Aの作品5件 + 別女優5件（各1件）: count=6 は制約内で十分満たせる供給がある
  const sameActress = Array.from({ length: 5 }, (_, i) =>
    candidate({ externalId: `a${i}`, actress: [actress(1, '女優A')] }),
  )
  const others = Array.from({ length: 5 }, (_, i) =>
    candidate({ externalId: `o${i}`, actress: [actress(100 + i, `女優${i}`)] }),
  )
  const result = selectDiagnosisSet([...sameActress, ...others], { count: 6, maxPerActress: 2, maxPerMaker: 99 })
  assert.equal(result.length, 6)
  const actressACount = result.filter(c => c.actress.some(a => a.id === 1)).length
  assert.ok(actressACount <= 2, `expected <=2 of actress A, got ${actressACount}`)
})

test('制約を満たせないほど供給が乏しい場合は緩和して要求件数まで埋める（graceful degradation）', () => {
  const pool = Array.from({ length: 3 }, (_, i) =>
    candidate({ externalId: `w${i}`, actress: [actress(1, '女優A')] }),
  )
  const result = selectDiagnosisSet(pool, { count: 3, maxPerActress: 2 })
  assert.equal(result.length, 3) // 0件で止まらない
})

test('多様な代替候補が十分ある場合、同一メーカーはmaxPerMakerを超えて選ばれない', () => {
  const sameMaker = Array.from({ length: 5 }, (_, i) =>
    candidate({
      externalId: `m${i}`,
      actress: [actress(i, `女優${i}`)],
      maker: [{ id: 1, name: 'メーカーX' }],
    }),
  )
  const others = Array.from({ length: 5 }, (_, i) =>
    candidate({
      externalId: `o${i}`,
      actress: [actress(100 + i, `女優${i}`)],
      maker: [{ id: 200 + i, name: `メーカー${i}` }],
    }),
  )
  const result = selectDiagnosisSet([...sameMaker, ...others], { count: 7, maxPerActress: 99, maxPerMaker: 3 })
  assert.equal(result.length, 7)
  const makerXCount = result.filter(c => c.maker.some(m => m.id === 1)).length
  assert.ok(makerXCount <= 3, `expected <=3 of maker X, got ${makerXCount}`)
})

test('rngを固定すれば結果は決定的（再現可能）', () => {
  const pool = Array.from({ length: 5 }, (_, i) =>
    candidate({ externalId: `w${i}`, actress: [actress(i, `女優${i}`)] }),
  )
  const rngValues = [0.9, 0.1, 0.5, 0.3, 0.7]
  const a = selectDiagnosisSet(pool, { count: 5, rng: seq(rngValues) })
  const b = selectDiagnosisSet(pool, { count: 5, rng: seq(rngValues) })
  assert.deepEqual(a.map(c => c.externalId), b.map(c => c.externalId))
})
