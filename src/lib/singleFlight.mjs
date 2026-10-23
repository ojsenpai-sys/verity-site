// src/lib/singleFlight.mjs — プロセス内 single-flight(同一キーの同時実行を1回にまとめる)。
//
// 背景(Phase 1A): Next.js 16.2 の unstable_cache は、エントリが無い/stale のときの
// 再取得の重複排除を「1リクエスト内(workStore.pendingRevalidates)」でしか行わない
// (next/dist/server/web/spec-extension/unstable-cache.js)。そのため複数リクエストが
// 同時にキャッシュ切れへ到達すると、リクエスト数だけ同じDBクエリが並列に走る
// (deploy直後の空キャッシュ・TTL切れの瞬間)。unstable_cache のコールバック内で
// 本関数を通すことで、同一プロセス内の同時実行を1回に集約する。
//
// - 成功/失敗どちらの結果も、実行中に合流した全呼び出し元へそのまま返す。
// - 完了後(成功・失敗とも)キーを解放する。結果は保持しない(キャッシュは unstable_cache の責務)。
// - プロセス単位。PM2 cluster 等の複数プロセス間では集約されない(プロセス数が上限になる)。
//
// pure — DB/API呼び出しなし。node:test で直接テスト可能。

/** @type {Map<string, Promise<unknown>>} */
const inflight = new Map()

/**
 * @template T
 * @param {string} key 同一とみなす処理のキー(ユーザー固有情報を含めないこと)
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function singleFlight(key, fn) {
  const pending = inflight.get(key)
  if (pending) return /** @type {Promise<T>} */ (pending)
  // fn は then 経由でマイクロタスクに遅らせて起動する。fn が同期的に throw した場合でも
  // 「登録(set)→完了(finally で delete)」の順序を保証し、失敗Promiseがキーに残留しないようにする。
  const p = Promise.resolve()
    .then(fn)
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}

/** テスト用: 現在実行中のキー数。 */
export function inflightCount() {
  return inflight.size
}
