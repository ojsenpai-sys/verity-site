// 実行: node --test src/lib/supabase/__tests__/timeout.test.ts
//
// withFetchTimeout / isSupabaseTimeoutError の純粋ロジックを対象とする
// (実際のSupabase/ネットワーク接続は行わない。fetchはモック関数で代替)。
// フェイクタイマーは使わず、短い実時間タイムアウト(数十ms)で挙動を検証する
// (既存の scripts/__tests__ の慣習に合わせ node:test を使用)。
import test from 'node:test'
import assert from 'node:assert/strict'
import { withFetchTimeout, isSupabaseTimeoutError, SupabaseFetchTimeoutError } from '../timeout.ts'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 実際の fetch() は signal が abort されると即座に reject する。
// テスト用モックもその挙動を再現する(単に await delay() して事後に signal.aborted を
// 見るだけのモックだと、abort後も内部delayが最後まで居座ってしまい実際のfetchと乖離する)。
function abortableDelayFetch(ms: number): typeof fetch {
  return (async (_input, init) => {
    const signal = init?.signal
    if (signal?.aborted) throw signal.reason
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ ok: true } as Response), ms)
      signal?.addEventListener('abort', () => {
        clearTimeout(t)
        reject(signal.reason)
      }, { once: true })
    })
  }) as typeof fetch
}

test('withFetchTimeout: baseFetchが期限内に解決すればそのまま結果を返す', async () => {
  const fakeFetch = (async () => {
    await delay(5)
    return { ok: true } as Response
  }) as typeof fetch
  const timed = withFetchTimeout(fakeFetch, 200)
  const res = await timed('https://example.test/')
  assert.equal((res as unknown as { ok: boolean }).ok, true)
})

test('withFetchTimeout: baseFetchがtimeoutMsより遅い場合はSupabaseFetchTimeoutErrorでreject', async () => {
  const timed = withFetchTimeout(abortableDelayFetch(200), 30)
  await assert.rejects(() => timed('https://example.test/'), (err: unknown) => {
    assert.ok(isSupabaseTimeoutError(err))
    assert.ok(err instanceof SupabaseFetchTimeoutError)
    return true
  })
})

test('isSupabaseTimeoutError: タイムアウト以外の通常のErrorはfalse', () => {
  assert.equal(isSupabaseTimeoutError(new Error('network down')), false)
})

test('isSupabaseTimeoutError: undefined/プレーンオブジェクトでも例外を投げずfalseを返す', () => {
  assert.equal(isSupabaseTimeoutError(undefined), false)
  assert.equal(isSupabaseTimeoutError({ message: 'not an error' }), false)
})

test('withFetchTimeout: 呼び出し元が既に渡したsignalがabortされていれば即座にabortされる', async () => {
  const controller = new AbortController()
  controller.abort(new Error('caller-aborted'))
  const timed = withFetchTimeout(abortableDelayFetch(50), 500)
  await assert.rejects(
    () => timed('https://example.test/', { signal: controller.signal }),
    (err: unknown) => {
      assert.equal((err as Error).message, 'caller-aborted')
      assert.equal(isSupabaseTimeoutError(err), false)
      return true
    },
  )
})

test('withFetchTimeout: 呼び出し元のsignalが後からabortされてもfetch側のsignalへ伝播する', async () => {
  const controller = new AbortController()
  const timed = withFetchTimeout(abortableDelayFetch(500), 500)
  const p = timed('https://example.test/', { signal: controller.signal })
  setTimeout(() => controller.abort(new Error('caller-aborted-late')), 10)
  await assert.rejects(() => p, (err: unknown) => {
    assert.equal((err as Error).message, 'caller-aborted-late')
    return true
  })
})

test('withFetchTimeout: 正常終了時はタイマー/リスナーが残らない(プロセスが自然終了することで確認)', async () => {
  const fakeFetch = (async () => ({ ok: true } as Response)) as typeof fetch
  const timed = withFetchTimeout(fakeFetch, 50)
  for (let i = 0; i < 20; i++) {
    await timed('https://example.test/')
  }
  // 20回呼んでも clearTimeout が正しく効いていればハンドルは残らず、
  // このtestプロセス自体がタイムアウトせず完了することが確認になる。
  assert.ok(true)
})

test('SupabaseFetchTimeoutError: メッセージにtimeoutMsが含まれ、name/instanceofがAbortErrorとして認識される', () => {
  const err = new SupabaseFetchTimeoutError(8000)
  assert.match(err.message, /8000/)
  // name は意図的に 'AbortError' (DOMException継承)。
  // @supabase/postgrest-js の executeWithRetry は fetchError.name === 'AbortError' の場合のみ
  // リトライをスキップするため、他のnameだと最大3回・指数バックオフでリトライされ
  // 8秒timeoutの意図が約39秒(4attempt×8s+7s backoff)に膨れ上がる。
  assert.equal(err.name, 'AbortError')
  assert.ok(err instanceof DOMException)
  assert.ok(err instanceof SupabaseFetchTimeoutError)
  assert.ok(isSupabaseTimeoutError(err))
})

test('withFetchTimeout: N件が同時にtimeoutしても直列化されない(timeoutMs×Nにならない)', async () => {
  const timed = withFetchTimeout(abortableDelayFetch(5000), 30)
  const N = 10
  const start = Date.now()
  const results = await Promise.allSettled(
    Array.from({ length: N }, () => timed('https://example.test/')),
  )
  const elapsed = Date.now() - start
  assert.ok(results.every((r) => r.status === 'rejected'))
  assert.ok(results.every((r) => r.status === 'rejected' && isSupabaseTimeoutError(r.reason)))
  // 直列化されていれば 30ms×10 = 300ms 以上かかるはず。並列であれば1回分(~30-100ms)で完了する。
  assert.ok(elapsed < 250, `expected parallel timeouts to finish quickly, took ${elapsed}ms`)
})

test('withFetchTimeout: init(headers/method/body等)を破壊せずbaseFetchへ引き継ぐ(signalのみ差し替え)', async () => {
  let received: RequestInit | undefined
  const fakeFetch = (async (_input, init) => {
    received = init
    return { ok: true } as Response
  }) as typeof fetch
  const timed = withFetchTimeout(fakeFetch, 200)
  await timed('https://example.test/', {
    method: 'POST',
    headers: { 'x-test': '1' },
    body: 'payload',
    cache: 'no-store',
  })
  assert.equal(received?.method, 'POST')
  assert.deepEqual(received?.headers, { 'x-test': '1' })
  assert.equal(received?.body, 'payload')
  assert.equal(received?.cache, 'no-store')
  assert.ok(received?.signal instanceof AbortSignal)
})

test('withFetchTimeout: unhandled rejectionを発生させない(タイムアウト/外部abort混在で連続実行)', async () => {
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    const timed = withFetchTimeout(abortableDelayFetch(60), 20)

    const controller = new AbortController()
    const timedWithExternal = withFetchTimeout(abortableDelayFetch(60), 500)

    await Promise.allSettled([
      timed('https://example.test/a'),
      timed('https://example.test/b'),
      timedWithExternal('https://example.test/c', { signal: controller.signal }),
    ])
    controller.abort(new Error('late-abort-after-settle'))
    await delay(20)
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
  assert.deepEqual(unhandled, [])
})
