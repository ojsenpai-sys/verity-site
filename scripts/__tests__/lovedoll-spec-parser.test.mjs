// scripts/__tests__/lovedoll-spec-parser.test.mjs
// 実行: node --test scripts/__tests__/lovedoll-spec-parser.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseHeightCm, parseCup, parseMaterial, parseSpec } from '../../src/lib/lovedoll/specParser.mjs'

test('parseHeightCm: 実データのタイトルから正しく抽出する', () => {
  assert.equal(parseHeightCm('XTDOLL 157cm Cocoaヘッド Dカップ かわいい フルシリコン ラブドール'), 157)
  assert.equal(parseHeightCm('蛍火日記 DOLL 159cm Nanakoヘッド 菜菜子 Eカップ 美人 フルシリコン'), 159)
  assert.equal(parseHeightCm('XTDOLL 164cm Rinoヘッド XT-byb35 Cカップ 美少女 フルシリコン'), 164)
})
test('parseHeightCm: cmが無いタイトル(女優コラボ等)はnull', () => {
  assert.equal(parseHeightCm('深田えいみ 等身大ラブドール'), null)
  assert.equal(parseHeightCm(''), null)
  assert.equal(parseHeightCm(undefined), null)
})
test('parseHeightCm: 非現実的な数値(誤抽出防止レンジ外)はnull', () => {
  assert.equal(parseHeightCm('2026cm記念モデル'), null) // 型番的な数字を身長と誤認しない
  assert.equal(parseHeightCm('50cmミニチュア'), null)
})

test('parseCup: 実データのタイトルから正しく抽出する', () => {
  assert.equal(parseCup('XTDOLL 157cm Cocoaヘッド Dカップ かわいい'), 'D')
  assert.equal(parseCup('蛍火日記 DOLL 159cm Nanakoヘッド 菜菜子 Eカップ 美人'), 'E')
  assert.equal(parseCup('XTDOLL 163cm Miyukiヘッド XT-byb17-B Fカップ かわいい'), 'F')
})
test('parseCup: カップ表記が無いタイトルはnull', () => {
  assert.equal(parseCup('深田えいみ 等身大ラブドール'), null)
})

test('parseMaterial: フルシリコンを正しく抽出する(シリコンへの部分一致で終わらない)', () => {
  assert.equal(parseMaterial('XTDOLL 157cm Cocoaヘッド Dカップ かわいい フルシリコン ラブドール'), 'フルシリコン')
})
test('parseMaterial: TPEを正しく抽出する', () => {
  assert.equal(parseMaterial('リアル質感TPE製 半身ドール 約21kg'), 'TPE')
})
test('parseMaterial: 素材表記が無いタイトルはnull', () => {
  assert.equal(parseMaterial('深田えいみ 等身大ラブドール'), null)
})

test('parseSpec: 3項目をまとめて抽出し、推測せずnullを含める', () => {
  const spec = parseSpec({ title: 'XTDOLL 157cm Cocoaヘッド Dカップ かわいい フルシリコン ラブドール ダッチワイフ 高級' })
  assert.deepEqual(spec, { heightCm: 157, cup: 'D', material: 'フルシリコン' })
})
test('parseSpec: 女優コラボ商品(spec情報なし)は全てnull', () => {
  const spec = parseSpec({ title: '深田えいみ 等身大ラブドール' })
  assert.deepEqual(spec, { heightCm: null, cup: null, material: null })
})
test('parseSpec: titleが欠落していても例外を投げない', () => {
  assert.deepEqual(parseSpec({}), { heightCm: null, cup: null, material: null })
})
