// 実行: node --test src/components/__tests__/favoriteButtonLogic.test.ts
//
// FavoriteButton のサーバー応答判定ロジック（Phase FAV-2）の純粋ロジックを対象とする。
// このプロジェクトには @testing-library/react 等のコンポーネントレンダリング/DOM操作テスト
// 基盤が存在しないため（package.json未導入）、大きな新規テスト依存を追加せず、既存の
// src/lib/supabase/__tests__/timeout.test.ts と同じ node:test 直接実行の慣習に合わせる。
// 「成功時に見た目が変わらない」「連打でリクエストが多重発火しない」といったDOM/タイミング
// 依存の挙動は、本番デプロイ後の手動検証（STEP8）で確認する。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyActressFavoriteResponse,
  classifyArticleFavoriteResponse,
  classifyFavoriteRequestException,
  MAX_REACHED_MESSAGE,
  GENERIC_FAILURE_MESSAGE,
} from '../favoriteButtonLogic.ts'

// ── actress: 成功時は状態を維持する ──────────────────────────────────────────
test('classifyActressFavoriteResponse: res.ok=true かつ json.ok=true は revert しない', () => {
  const outcome = classifyActressFavoriteResponse(true, { ok: true })
  assert.equal(outcome.shouldRevert, false)
  assert.equal(outcome.message, null)
})

test('classifyActressFavoriteResponse: noop(既にお気に入り済み)も ok:true として扱い revert しない', () => {
  const outcome = classifyActressFavoriteResponse(true, { ok: true })
  assert.equal(outcome.shouldRevert, false)
})

// ── actress: max_reached ソフト失敗(HTTP 200 + ok:false) ────────────────────
test('classifyActressFavoriteResponse: max_reached は revert し、指定メッセージを返す', () => {
  const outcome = classifyActressFavoriteResponse(true, { ok: false, reason: 'max_reached' })
  assert.equal(outcome.shouldRevert, true)
  assert.equal(outcome.message, MAX_REACHED_MESSAGE)
})

// ── actress: その他の失敗（非2xx / 不明なreason / bodyなし）──────────────────
test('classifyActressFavoriteResponse: 非2xxはrevertし、汎用メッセージを返す', () => {
  const outcome = classifyActressFavoriteResponse(false, null)
  assert.equal(outcome.shouldRevert, true)
  assert.equal(outcome.message, GENERIC_FAILURE_MESSAGE)
})

test('classifyActressFavoriteResponse: res.ok=trueでもjsonがnull(パース失敗)ならrevertし汎用メッセージ', () => {
  const outcome = classifyActressFavoriteResponse(true, null)
  assert.equal(outcome.shouldRevert, true)
  assert.equal(outcome.message, GENERIC_FAILURE_MESSAGE)
})

test('classifyActressFavoriteResponse: ok:falseだがreasonがmax_reached以外は汎用メッセージ', () => {
  const outcome = classifyActressFavoriteResponse(true, { ok: false, reason: 'something_else' })
  assert.equal(outcome.shouldRevert, true)
  assert.equal(outcome.message, GENERIC_FAILURE_MESSAGE)
})

// ── article: 成功/失敗 ────────────────────────────────────────────────────────
test('classifyArticleFavoriteResponse: res.ok=true はrevertしない', () => {
  const outcome = classifyArticleFavoriteResponse(true)
  assert.equal(outcome.shouldRevert, false)
  assert.equal(outcome.message, null)
})

test('classifyArticleFavoriteResponse: 非2xxはrevertし汎用メッセージ', () => {
  const outcome = classifyArticleFavoriteResponse(false)
  assert.equal(outcome.shouldRevert, true)
  assert.equal(outcome.message, GENERIC_FAILURE_MESSAGE)
})

// ── ネットワーク例外 ──────────────────────────────────────────────────────────
test('classifyFavoriteRequestException: 常にrevertし汎用メッセージを返す(ネットワーク例外/fetch自体の失敗)', () => {
  const outcome = classifyFavoriteRequestException()
  assert.equal(outcome.shouldRevert, true)
  assert.equal(outcome.message, GENERIC_FAILURE_MESSAGE)
})
