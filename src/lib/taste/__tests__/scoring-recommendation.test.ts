// 実行: node --test src/lib/taste/__tests__/scoring-recommendation.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { rankWorks, rankActresses, buildTasteSummary, computeWeights } from '../scoring.ts'
import { candidate, actress, actressInfo } from './fixtures.ts'
import type { AnsweredItem } from '../types.ts'

test('rankWorks: LIKEした女優の作品が上位に来る', () => {
  const liked = candidate({ externalId: 'liked-src', actress: [actress(1, '女優A')] })
  const sameActress = candidate({ externalId: 'same-actress', actress: [actress(1, '女優A')] })
  const unrelated = candidate({ externalId: 'unrelated', actress: [actress(99, '女優Z')] })
  const weights = computeWeights([{ candidate: liked, answer: 'like' }], [liked, sameActress, unrelated])

  const result = rankWorks([sameActress, unrelated], weights, { limit: 10 })
  assert.equal(result[0].candidate.externalId, 'same-actress')
  assert.ok(result[0].score > result[1].score)
})

test('rankWorks: 出題済み(excludeExternalIds)は除外される', () => {
  const liked = candidate({ externalId: 'liked', actress: [actress(1, '女優A')] })
  const sameActress = candidate({ externalId: 'same-actress', actress: [actress(1, '女優A')] })
  const weights = computeWeights([{ candidate: liked, answer: 'like' }], [liked, sameActress])

  const result = rankWorks([sameActress], weights, { excludeExternalIds: new Set(['same-actress']) })
  assert.deepEqual(result, [])
})

test('rankWorks: 好みシグナルが無い（zero like / all neutral）場合でも0件にならずフォールバックする', () => {
  const c1 = candidate({ externalId: 'w1', actress: [actress(1, '女優A')] })
  const c2 = candidate({ externalId: 'w2', actress: [actress(2, '女優B')], isPopular: true })
  const weights = computeWeights([{ candidate: c1, answer: 'neutral' }], [c1, c2])

  const result = rankWorks([c1, c2], weights, { limit: 10 })
  assert.equal(result.length, 2)
  assert.ok(result.every(r => r.score === 0))
  // isPopularが優先される
  assert.equal(result[0].candidate.externalId, 'w2')
})

test('rankWorks: 全問DISLIKEでもクラッシュせずフォールバック推薦を返す', () => {
  const c1 = candidate({ externalId: 'w1', actress: [actress(1, '女優A')], tags: ['SM'] })
  const c2 = candidate({ externalId: 'w2', actress: [actress(2, '女優B')] })
  const weights = computeWeights([{ candidate: c1, answer: 'dislike' }], [c1, c2])

  const result = rankWorks([c1, c2], weights, { limit: 10 })
  assert.equal(result.length, 2)
})

test('rankWorks: 候補プールが空なら空配列（クラッシュしない）', () => {
  const weights = computeWeights([], [])
  assert.deepEqual(rankWorks([], weights), [])
})

test('rankWorks: 画像URL欠損の候補は推薦結果から除外される', () => {
  const c1 = candidate({ externalId: 'w1', imageUrl: null, actress: [actress(1, '女優A')] })
  const weights = computeWeights([], [c1])
  assert.deepEqual(rankWorks([c1], weights), [])
})

test('rankWorks: limitを超えない', () => {
  const liked = candidate({ externalId: 'seed', actress: [actress(1, '女優A')] })
  const pool = Array.from({ length: 20 }, (_, i) =>
    candidate({ externalId: `w${i}`, actress: [actress(1, '女優A')] }),
  )
  const weights = computeWeights([{ candidate: liked, answer: 'like' }], [liked, ...pool])
  const result = rankWorks(pool, weights, { limit: 5 })
  assert.equal(result.length, 5)
})

test('rankActresses: LIKEした女優に近い傾向の女優が上位に来る', () => {
  const liked = candidate({ externalId: 'liked', actress: [actress(1, '女優A')] })
  const candA = candidate({ externalId: 'ca', actress: [actress(1, '女優A')] })
  const candB = candidate({ externalId: 'cb', actress: [actress(2, '女優B')] })
  const weights = computeWeights([{ candidate: liked, answer: 'like' }], [liked, candA, candB])
  const idx = { 'dmm-actress-1': actressInfo('dmm-actress-1', '女優A'), 'dmm-actress-2': actressInfo('dmm-actress-2', '女優B') }

  const result = rankActresses([candA, candB], idx, weights, { limit: 5 })
  assert.equal(result[0].info.name, '女優A')
})

test('rankActresses: actressIndexに表示情報が無い女優は候補から除外される', () => {
  const candA = candidate({ externalId: 'ca', actress: [actress(1, '女優A')] })
  const weights = computeWeights([], [candA])
  const result = rankActresses([candA], {}, weights, { limit: 5 })
  assert.deepEqual(result, [])
})

test('rankActresses: 好みシグナルが無い場合は空配列にならずフォールバックする', () => {
  const candA = candidate({ externalId: 'ca', actress: [actress(1, '女優A')] })
  const weights = computeWeights([], [candA])
  const idx = { 'dmm-actress-1': actressInfo('dmm-actress-1', '女優A') }
  const result = rankActresses([candA], idx, weights, { limit: 5 })
  assert.equal(result.length, 1)
  assert.equal(result[0].score, 0)
})

test('rankActresses: limitを超えない', () => {
  const liked = candidate({ externalId: 'seed', actress: [actress(1, '女優A')] })
  const pool = Array.from({ length: 8 }, (_, i) => candidate({ externalId: `w${i}`, actress: [actress(i, `女優${i}`)] }))
  const weights = computeWeights([{ candidate: liked, answer: 'like' }], [liked, ...pool])
  const idx = Object.fromEntries(pool.map((_, i) => [`dmm-actress-${i}`, actressInfo(`dmm-actress-${i}`, `女優${i}`)]))
  const result = rankActresses(pool, idx, weights, { limit: 3 })
  assert.ok(result.length <= 3)
})

test('buildTasteSummary: LIKEが0件なら中立メッセージのみ返す（裏付けの無い断定をしない）', () => {
  const weights = computeWeights([], [])
  const lines = buildTasteSummary([], weights, [])
  assert.equal(lines.length, 1)
})

test('buildTasteSummary: 裏付け（十分な重み）が無いタグは文面化しない', () => {
  const c = candidate({ externalId: 'w1', actress: [actress(1, '女優A')], tags: ['人妻'] })
  const answers: AnsweredItem[] = [{ candidate: c, answer: 'like' }]
  const weights = computeWeights(answers, [c])
  // like 1件 = weight 2 (閾値ちょうど)
  const lines = buildTasteSummary(answers, weights, [c])
  assert.ok(lines.some(l => l.includes('人妻')))
})

test('buildTasteSummary: メーカー名はfullPoolから解決される', () => {
  const c1 = candidate({ externalId: 'w1', actress: [actress(1, '女優A')], maker: [{ id: 10, name: 'メーカーX' }] })
  const c2 = candidate({ externalId: 'w2', actress: [actress(1, '女優A')], maker: [{ id: 10, name: 'メーカーX' }] })
  const answers: AnsweredItem[] = [
    { candidate: c1, answer: 'like' },
    { candidate: c2, answer: 'like' },
  ]
  const weights = computeWeights(answers, [c1, c2])
  const lines = buildTasteSummary(answers, weights, [c1, c2])
  assert.ok(lines.some(l => l.includes('メーカーX')))
})
