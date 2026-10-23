// scripts/__tests__/single-flight.test.mjs
// 実行: node --test scripts/__tests__/single-flight.test.mjs
//
// src/lib/singleFlight.mjs(プロセス内の同一キー同時実行の集約)を対象とする。
import test from 'node:test'
import assert from 'node:assert/strict'
import { singleFlight, inflightCount } from '../../src/lib/singleFlight.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('同一キーの同時呼び出しは fn を1回だけ実行し、全員に同じ結果を返す', async () => {
  let calls = 0
  const d = deferred()
  const fn = () => { calls++; return d.promise }
  const ps = Array.from({ length: 20 }, () => singleFlight('k', fn))
  assert.equal(inflightCount(), 1)
  d.resolve({ v: 42 })
  const results = await Promise.all(ps)
  assert.equal(calls, 1)
  for (const r of results) assert.deepEqual(r, { v: 42 })
  assert.equal(inflightCount(), 0)
})

test('異なるキーは独立して実行される', async () => {
  let calls = 0
  const fn = async () => { calls++; return calls }
  await Promise.all([singleFlight('a', fn), singleFlight('b', fn), singleFlight('a', fn)])
  assert.equal(calls, 2)
})

test('失敗も合流した全員に伝播し、完了後はキーが解放されて再実行できる', async () => {
  let calls = 0
  const d = deferred()
  const ps = [1, 2, 3].map(() => singleFlight('err', () => { calls++; return d.promise }))
  d.reject(new Error('boom'))
  for (const p of ps) await assert.rejects(p, /boom/)
  assert.equal(calls, 1)
  assert.equal(inflightCount(), 0)
  const v = await singleFlight('err', async () => { calls++; return 'ok' })
  assert.equal(v, 'ok')
  assert.equal(calls, 2)
})

test('完了後の呼び出しは結果を保持せず再実行する(キャッシュは持たない)', async () => {
  let calls = 0
  const fn = async () => ++calls
  assert.equal(await singleFlight('seq', fn), 1)
  assert.equal(await singleFlight('seq', fn), 2)
})

test('非同期 reject 後もキーが解放され、同じキーで即座に再実行できる', async () => {
  let calls = 0
  const fn = async () => { calls++; await new Promise((r) => setTimeout(r, 5)); throw new Error('async-boom') }
  const p1 = singleFlight('async-err', fn)
  const p2 = singleFlight('async-err', fn) // 実行中に合流
  assert.equal(inflightCount(), 1)
  await assert.rejects(p1, /async-boom/)
  await assert.rejects(p2, /async-boom/)
  assert.equal(calls, 1)
  assert.equal(inflightCount(), 0)
  // 解放後は新しい実行になる(失敗Promiseが再利用されない)
  assert.equal(await singleFlight('async-err', async () => 'recovered'), 'recovered')
  assert.equal(inflightCount(), 0)
})

test('キーごとに独立: 一方の reject・実行中は他方の結果や実行に影響しない', async () => {
  const slow = deferred()
  let aCalls = 0, bCalls = 0, cCalls = 0
  const pa = singleFlight('indep-a', () => { aCalls++; return slow.promise })               // 実行中のまま
  const pb = singleFlight('indep-b', async () => { bCalls++; throw new Error('b-failed') }) // 失敗
  const pc = singleFlight('indep-c', async () => { cCalls++; return 'c-ok' })               // 成功
  await assert.rejects(pb, /b-failed/)
  assert.equal(await pc, 'c-ok')
  assert.equal(inflightCount(), 1) // a だけが残る
  // a 実行中に b を再実行しても a に合流せず独立して動く
  assert.equal(await singleFlight('indep-b', async () => { bCalls++; return 'b-ok' }), 'b-ok')
  slow.resolve('a-ok')
  assert.equal(await pa, 'a-ok')
  assert.deepEqual([aCalls, bCalls, cCalls], [1, 2, 1])
  assert.equal(inflightCount(), 0)
})

test('fn が同期的に throw しても伝播し、キーが解放される', async () => {
  await assert.rejects(singleFlight('sync', () => { throw new Error('sync-boom') }), /sync-boom/)
  assert.equal(inflightCount(), 0)
})
