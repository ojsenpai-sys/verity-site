// scripts/__tests__/notification-mailer.test.mjs
// 実行: node --test scripts/__tests__/notification-mailer.test.mjs
//
// scripts/lib/notification-mailer.mjs の pure ロジックと、Resend冪等キー付与(Phase 3B-2)
// を対象とする。実ネットワーク呼び出しは行わない(globalThis.fetchをモックして検証)。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDeliveryIdempotencyKey,
  sendViaResend,
  exceedsMaxSend,
} from '../lib/notification-mailer.mjs'

// ── buildDeliveryIdempotencyKey ───────────────────────────────────────────────
test('buildDeliveryIdempotencyKey: 同一deliveryIdは常に同一キーになる(stale-pending/failed再送時の再現性)', () => {
  const k1 = buildDeliveryIdempotencyKey('anr-delivery', 17)
  const k2 = buildDeliveryIdempotencyKey('anr-delivery', 17)
  assert.equal(k1, k2)
  assert.equal(k1, 'anr-delivery-17')
})

test('buildDeliveryIdempotencyKey: 異なるdeliveryId(=異なるユーザー/日付の配信行)は異なるキーになる', () => {
  const k1 = buildDeliveryIdempotencyKey('anr-delivery', 17)
  const k2 = buildDeliveryIdempotencyKey('anr-delivery', 18)
  assert.notEqual(k1, k2)
})

test('buildDeliveryIdempotencyKey: キーにメールアドレス等PIIを含まない(数値idのみから構成される)', () => {
  const key = buildDeliveryIdempotencyKey('anr-delivery', 17)
  assert.match(key, /^anr-delivery-\d+$/)
  assert.doesNotMatch(key, /@/)
})

test('buildDeliveryIdempotencyKey: deliveryIdが未定義/0/nullの場合はundefined(ヘッダー省略・従来動作維持)', () => {
  assert.equal(buildDeliveryIdempotencyKey('anr-delivery', undefined), undefined)
  assert.equal(buildDeliveryIdempotencyKey('anr-delivery', null), undefined)
  assert.equal(buildDeliveryIdempotencyKey('anr-delivery', 0), undefined)
})

// ── sendViaResend: Idempotency-Keyヘッダーの付与を検証(実ネットワーク呼び出しなし) ──
function withMockedFetch(mockImpl, fn) {
  const original = globalThis.fetch
  globalThis.fetch = mockImpl
  return fn().finally(() => { globalThis.fetch = original })
}

test('sendViaResend: idempotencyKey指定時、HTTPリクエストヘッダーにIdempotency-Keyを付与する', async () => {
  let capturedHeaders
  await withMockedFetch(async (url, options) => {
    capturedHeaders = options.headers
    return { ok: true, text: async () => JSON.stringify({ id: 'resend-id-1' }) }
  }, async () => {
    const json = await sendViaResend({
      apiKey: 'test-key', from: 'a@example.com', to: 'b@example.com',
      subject: 's', html: '<p>h</p>', text: 't',
      idempotencyKey: 'anr-delivery-17',
    })
    assert.equal(json.id, 'resend-id-1')
  })
  assert.equal(capturedHeaders['Idempotency-Key'], 'anr-delivery-17')
})

test('sendViaResend: idempotencyKey未指定時はIdempotency-Keyヘッダーを付与しない(従来動作維持)', async () => {
  let capturedHeaders
  await withMockedFetch(async (url, options) => {
    capturedHeaders = options.headers
    return { ok: true, text: async () => JSON.stringify({ id: 'resend-id-2' }) }
  }, async () => {
    await sendViaResend({
      apiKey: 'test-key', from: 'a@example.com', to: 'b@example.com',
      subject: 's', html: '<p>h</p>', text: 't',
    })
  })
  assert.equal('Idempotency-Key' in capturedHeaders, false)
})

test('sendViaResend: List-Unsubscribeヘッダー(メール自体のカスタムヘッダー)は従来どおりbody.headersに入る(回帰確認)', async () => {
  let capturedBody
  await withMockedFetch(async (url, options) => {
    capturedBody = JSON.parse(options.body)
    return { ok: true, text: async () => JSON.stringify({ id: 'resend-id-3' }) }
  }, async () => {
    await sendViaResend({
      apiKey: 'test-key', from: 'a@example.com', to: 'b@example.com',
      subject: 's', html: '<p>h</p>', text: 't',
      unsubscribeUrl: 'https://example.com/unsub',
      idempotencyKey: 'anr-delivery-17',
    })
  })
  assert.equal(capturedBody.headers['List-Unsubscribe'], '<https://example.com/unsub>')
  assert.equal(capturedBody.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  assert.equal(capturedBody.from, 'a@example.com')
  assert.deepEqual(capturedBody.to, ['b@example.com'])
})

test('sendViaResend: 既存の失敗時挙動(non-2xxでthrow)は変更なし(回帰確認)', async () => {
  await withMockedFetch(async () => ({ ok: false, status: 409, text: async () => 'invalid_idempotent_request' }), async () => {
    await assert.rejects(
      () => sendViaResend({ apiKey: 'k', from: 'a@example.com', to: 'b@example.com', subject: 's', html: 'h', text: 't', idempotencyKey: 'anr-delivery-17' }),
      /Resend HTTP 409/,
    )
  })
})

// ── exceedsMaxSend: 既存のmax-send純粋関数(このPhaseで変更していないことの回帰確認) ──
test('exceedsMaxSend: --max-send=1はcandidateCount<=1のときのみ通過する(Phase 3A/3B-2で未変更)', () => {
  assert.equal(exceedsMaxSend(0, 1), false)
  assert.equal(exceedsMaxSend(1, 1), false)
  assert.equal(exceedsMaxSend(2, 1), true)
})
