// scripts/__tests__/crown-verity-master.test.mjs
// 王冠バッジ(LP単独判定) / VERITY マスター(crownCount>=3判定)の pure ロジック検証。
// node --test scripts/__tests__/crown-verity-master.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasCrown,
  computeCrownActressIds,
  isVerityMaster,
  computeStarsFromCrownCount,
  CROWN_LP_THRESHOLD,
} from '../../src/lib/crownSelection.mjs'

// ── 王冠: LP単独判定 ──────────────────────────────────────────────────────────
test('1. LP 0 → crown=false', () => {
  assert.equal(hasCrown(0), false)
})
test('2. LP 29 → false', () => {
  assert.equal(hasCrown(29), false)
})
test('3. LP 30 → true', () => {
  assert.equal(hasCrown(30), true)
})
test('4. LP 31 → true', () => {
  assert.equal(hasCrown(31), true)
})
test('5. LP 100 → true', () => {
  assert.equal(hasCrown(100), true)
})
test('6. click=0でもLP30ならtrue（hasCrownはclickを引数に取らない=判定に一切使用しない）', () => {
  // 王冠判定は lpPoints のみを受け取る設計そのものが「click条件を廃止した」ことの証明。
  assert.equal(hasCrown(30), true)
  assert.equal(CROWN_LP_THRESHOLD, 30)
})
test('7. clickが100回相当でもLP29ならfalse（clickは引数として存在しないため無関係）', () => {
  assert.equal(hasCrown(29), false)
})

// ── VERITY マスター: crownCount >= 3 判定 ────────────────────────────────────
test('8. 王冠0名 → false', () => {
  assert.equal(isVerityMaster(0), false)
})
test('9. 王冠2名 → false', () => {
  assert.equal(isVerityMaster(2), false)
})
test('10. 王冠3名 → true', () => {
  assert.equal(isVerityMaster(3), true)
})

// ── 推しスロット数と王冠数の組み合わせ（「推し全員」ではなくcrownCount基準） ──────
function crownCountFor(favCount, crownedCount) {
  // favCount名の推しのうち先頭crownedCount名がLP30以上、残りはLP0のシナリオ
  const favoriteActressIds = Array.from({ length: favCount }, (_, i) => `actress-${i}`)
  const lpPointsMap = {}
  for (let i = 0; i < favCount; i++) lpPointsMap[`actress-${i}`] = i < crownedCount ? 30 : 0
  return computeCrownActressIds(favoriteActressIds, lpPointsMap).length
}

test('11. 推し3名・王冠3名 → true', () => {
  const crownCount = crownCountFor(3, 3)
  assert.equal(crownCount, 3)
  assert.equal(isVerityMaster(crownCount), true)
})
test('12. 推し4名・王冠3名 → true（推し全員ではなくcrownCount>=3で成立）', () => {
  const crownCount = crownCountFor(4, 3)
  assert.equal(crownCount, 3)
  assert.equal(isVerityMaster(crownCount), true)
})
test('13. 推し5名・王冠3名 → true', () => {
  const crownCount = crownCountFor(5, 3)
  assert.equal(crownCount, 3)
  assert.equal(isVerityMaster(crownCount), true)
})
test('14. 推し4名・王冠2名 → false', () => {
  const crownCount = crownCountFor(4, 2)
  assert.equal(crownCount, 2)
  assert.equal(isVerityMaster(crownCount), false)
})

// ── ユーザー提示の具体例: 推し4名(A=30,B=30,C=30,D=5) → VERITY マスター達成 ──────
test('ユーザー提示例: 推し4名中3名が30LP・1名が5LP → VERITYマスター達成', () => {
  const favoriteActressIds = ['A', 'B', 'C', 'D']
  const lpPointsMap = { A: 30, B: 30, C: 30, D: 5 }
  const crownIds = computeCrownActressIds(favoriteActressIds, lpPointsMap)
  assert.deepEqual(crownIds.sort(), ['A', 'B', 'C'])
  assert.equal(isVerityMaster(crownIds.length), true)
})

// ── computeStarsFromCrownCount（Stars ratchetの元になる値） ──────────────────
test('computeStarsFromCrownCount: 3/6/9マイルストーン', () => {
  assert.equal(computeStarsFromCrownCount(0), 0)
  assert.equal(computeStarsFromCrownCount(2), 0)
  assert.equal(computeStarsFromCrownCount(3), 3)
  assert.equal(computeStarsFromCrownCount(5), 3)
  assert.equal(computeStarsFromCrownCount(6), 6)
  assert.equal(computeStarsFromCrownCount(8), 6)
  assert.equal(computeStarsFromCrownCount(9), 9)
  assert.equal(computeStarsFromCrownCount(12), 9)
})

// ── 15. LP投入シミュレーション: A=30,B=30,C=29 → Cへ1LP → 3王冠・マスター成立 ────
test('15. LP投入直後の再評価シミュレーション: A=30,B=30,C=29にCへ+1LPで3王冠・マスター成立', () => {
  const favoriteActressIds = ['A', 'B', 'C']
  const lpPointsMapBefore = { A: 30, B: 30, C: 29 }

  const crownBefore = computeCrownActressIds(favoriteActressIds, lpPointsMapBefore)
  assert.deepEqual(crownBefore.sort(), ['A', 'B'])
  assert.equal(isVerityMaster(crownBefore.length), false)

  // api/lp/route.ts が transfer_lp_to_actress の結果(lp_points更新後)を用いて
  // 行うのと同じ再計算を模擬する
  const lpPointsMapAfter = { ...lpPointsMapBefore, C: 30 }
  const crownAfter = computeCrownActressIds(favoriteActressIds, lpPointsMapAfter)
  assert.deepEqual(crownAfter.sort(), ['A', 'B', 'C'])
  assert.equal(crownAfter.length, 3)
  assert.equal(isVerityMaster(crownAfter.length), true)
  assert.equal(computeStarsFromCrownCount(crownAfter.length), 3)
})
