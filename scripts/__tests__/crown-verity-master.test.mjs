// scripts/__tests__/crown-verity-master.test.mjs
// 王冠バッジ(LP単独判定) / VERITY マスター(crownCount>=3判定)の pure ロジック検証。
// node --test scripts/__tests__/crown-verity-master.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

// ── backfill / idempotency 再発防止テスト ────────────────────────────────────
// root cause: void supabase.rpc(...) / void supabase.from(...).update(...) は
// postgrest-js の lazy-fetch (then() 内で初めて実 HTTP request を送信) により
// 実際には一度もリクエストが送信されない。page.tsx / api/lp/route.ts の該当4箇所を
// await 化して修正した。以下はその判定条件そのものの再発防止テスト。

test('backfill-1. LP 30/30/30/2(対象ユーザー実例) → crownCount=3 → master=true', () => {
  const favoriteActressIds = ['A', 'B', 'C', 'D']
  const lpPointsMap = { A: 30, B: 30, C: 30, D: 2 }
  const crownIds = computeCrownActressIds(favoriteActressIds, lpPointsMap)
  assert.equal(crownIds.length, 3)
  assert.equal(isVerityMaster(crownIds.length), true)
})

test('backfill-2. stars_count=0, crownBasedStars=3 → sync_user_stars 呼び出し対象 (crownBasedStars > dbStars)', () => {
  const dbStars = 0
  const crownBasedStars = computeStarsFromCrownCount(3)
  assert.equal(crownBasedStars, 3)
  assert.equal(crownBasedStars > dbStars, true)
})

test('backfill-3. stars_count=3, crownBasedStars=3 → 再同期不要 (crownBasedStars > dbStars が false)', () => {
  const dbStars = 3
  const crownBasedStars = computeStarsFromCrownCount(3)
  assert.equal(crownBasedStars > dbStars, false)
})

test('backfill-4. titles_dataにverity_masterなし → 追加対象', () => {
  const titlesData = [{ id: 'newcomer' }, { id: 'oshi_katsu' }]
  const hasMasterTitle = titlesData.some(t => t.id === 'verity_master')
  assert.equal(hasMasterTitle, false)
  assert.equal(isVerityMaster(3) && !hasMasterTitle, true)
})

test('backfill-5. titles_dataにverity_master既存 → 重複追加しない', () => {
  const titlesData = [{ id: 'newcomer' }, { id: 'verity_master', unlocked_at: '2026-08-21T00:00:00.000Z' }]
  const hasMasterTitle = titlesData.some(t => t.id === 'verity_master')
  assert.equal(hasMasterTitle, true)
  assert.equal(isVerityMaster(3) && !hasMasterTitle, false)
})

// ── 静的チェック: 修正対象4箇所に void supabase.rpc / void supabase.from(...).update が
//    再登場していないことを grep 相当で確認（過剰なテスト基盤は作らない、正規表現のみ）。
function assertNoVoidSupabaseWrite(relPath) {
  const abs = fileURLToPath(new URL(`../../${relPath}`, import.meta.url))
  const src = readFileSync(abs, 'utf-8')
  const matches = src.match(/void\s+supabase\s*\.\s*(rpc|from)\s*\(/g) ?? []
  assert.deepEqual(matches, [], `${relPath} に void supabase.rpc/from(...) が再登場しています: ${JSON.stringify(matches)}`)
}

test('backfill-6. page.tsx に void supabase.rpc/from が存在しない', () => {
  assertNoVoidSupabaseWrite('src/app/verity/profile/page.tsx')
})

test('backfill-7. api/lp/route.ts に void supabase.rpc/from が存在しない', () => {
  assertNoVoidSupabaseWrite('src/app/verity/api/lp/route.ts')
})
