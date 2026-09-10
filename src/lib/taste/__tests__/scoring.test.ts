// 実行: node --test src/lib/taste/__tests__/scoring.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeWeights, scoreCandidateRaw, normalizeScores, matchLabel, ANSWER_POINTS } from '../scoring.ts'
import { candidate, actress } from './fixtures.ts'
import type { AnsweredItem } from '../types.ts'

test('ANSWER_POINTS: LIKE=+2, NEUTRAL=0, DISLIKE=-1', () => {
  assert.equal(ANSWER_POINTS.like, 2)
  assert.equal(ANSWER_POINTS.neutral, 0)
  assert.equal(ANSWER_POINTS.dislike, -1)
})

test('LIKEした作品の女優/タグ/メーカーに正の重みが付く', () => {
  const c = candidate({
    externalId: 'w1',
    actress: [actress(1, '女優A')],
    tags: ['人妻', '熟女'],
    maker: [{ id: 10, name: 'メーカーX' }],
  })
  const answers: AnsweredItem[] = [{ candidate: c, answer: 'like' }]
  const weights = computeWeights(answers, [c])
  assert.equal(weights.actress.get(1), 2)
  assert.equal(weights.tag.get('人妻'), 2)
  assert.equal(weights.maker.get(10), 2)
})

test('NEUTRALは重みに影響しない', () => {
  const c = candidate({ externalId: 'w1', actress: [actress(1, '女優A')], tags: ['人妻'] })
  const weights = computeWeights([{ candidate: c, answer: 'neutral' }], [c])
  assert.equal(weights.actress.size, 0)
  assert.equal(weights.tag.size, 0)
})

test('DISLIKEはsoft penalty（-1）であり、永久除外(-Infinity等)ではない', () => {
  const c = candidate({ externalId: 'w1', actress: [actress(1, '女優A')], tags: ['SM'] })
  const weights = computeWeights([{ candidate: c, answer: 'dislike' }], [c])
  assert.equal(weights.actress.get(1), -1)
  assert.equal(weights.tag.get('SM'), -1)
})

test('女優名と同名のタグはジャンル重みから除外される（二重カウント防止）', () => {
  const c = candidate({
    externalId: 'w1',
    actress: [actress(1, '女優A')],
    tags: ['女優A', '人妻'], // pipeline的にactress名がtagsに混ざるケースの模擬
  })
  const weights = computeWeights([{ candidate: c, answer: 'like' }], [c])
  assert.equal(weights.tag.has('女優A'), false)
  assert.equal(weights.tag.get('人妻'), 2)
})

test('ノイズタグ（フォーマット/画質等）はジャンル重みから除外される', () => {
  const c = candidate({ externalId: 'w1', actress: [actress(1, '女優A')], tags: ['4K', 'VR動画', '人妻'] })
  const weights = computeWeights([{ candidate: c, answer: 'like' }], [c])
  assert.equal(weights.tag.has('4K'), false)
  assert.equal(weights.tag.has('VR動画'), false) // includes('VR')
  assert.equal(weights.tag.get('人妻'), 2)
})

test('metadata欠損（actress/series/maker/tags空）でも例外を投げず0点を返す', () => {
  const empty = candidate({ externalId: 'empty' })
  const weights = computeWeights([], [empty])
  const score = scoreCandidateRaw(empty, weights)
  assert.equal(score, 0)
})

test('全問NEUTRALの場合、全candidateのスコアは0', () => {
  const c1 = candidate({ externalId: 'w1', actress: [actress(1, '女優A')] })
  const c2 = candidate({ externalId: 'w2', actress: [actress(2, '女優B')] })
  const weights = computeWeights([{ candidate: c1, answer: 'neutral' }], [c1, c2])
  assert.equal(scoreCandidateRaw(c1, weights), 0)
  assert.equal(scoreCandidateRaw(c2, weights), 0)
})

test('normalizeScores: 最大値が0以下（好みシグナル無し）なら全件0を返す', () => {
  assert.deepEqual(normalizeScores([0, 0, 0]), [0, 0, 0])
  assert.deepEqual(normalizeScores([-1, -2]), [0, 0])
})

test('normalizeScores: 最大値を100として比例配分する', () => {
  assert.deepEqual(normalizeScores([10, 5, 0]), [100, 50, 0])
})

test('normalizeScores: 負のスコアは0にクランプされる', () => {
  assert.deepEqual(normalizeScores([10, -5]), [100, 0])
})

test('matchLabel: 閾値でラベルが変わる（偽の統計的精度は主張しない文言）', () => {
  assert.equal(matchLabel(90), 'かなり近い')
  assert.equal(matchLabel(50), '好みに合いそう')
  assert.equal(matchLabel(10), '新しい発見')
})
