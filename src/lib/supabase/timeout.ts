// Supabase (PostgREST) へのサーバーサイドfetchに上限時間を設けるための共通ヘルパー。
// 2026-09-05 インシデント(DB高負荷でSupabaseへのfetchが無期限にハングし、
// Node側のメモリ増加→PM2 max_memory_restartループを誘発)の再発防止策(Phase 3.2)。
// client.ts(ブラウザ側)には適用しない — 対象は server.ts の custom fetch のみ。
//
// 本ファイルは next/navigation 等 Next.js ランタイム依存を一切持たない純粋ロジックのみを置く
// (node --test で直接ユニットテスト可能にするため)。Next.js依存のエラーハンドリングは
// ./timeoutHandler.ts に分離する。

export const SUPABASE_FETCH_TIMEOUT_MS = 8000

// DOMException(name: 'AbortError') を継承する。理由:
// @supabase/postgrest-js の executeWithRetry は `fetchError.name === 'AbortError'` の場合のみ
// リトライをスキップする(それ以外は"network error"とみなし、指数バックオフで最大3回リトライする
// — 1回あたり最大 timeoutMs かかるため 8秒timeoutのつもりが実質 4×8s+7s ≈ 39秒に膨れ上がる)。
// 単純な Error のカスタムnameでは postgrest-js 側の判定に一致しないため、実際に
// AbortError として認識されるよう DOMException を継承する(instanceof/nameとも本物のAbortErrorと
// 同一に振る舞いつつ、SupabaseFetchTimeoutError固有の instanceof 判定も両立できる)。
export class SupabaseFetchTimeoutError extends DOMException {
  constructor(timeoutMs: number) {
    super(`Supabase fetch timed out after ${timeoutMs}ms`, 'AbortError')
  }
}

export function isSupabaseTimeoutError(err: unknown): boolean {
  return err instanceof SupabaseFetchTimeoutError
}

/**
 * baseFetch をラップし、timeoutMs 経過で AbortController.abort() する fetch を返す。
 * 呼び出し元が既に options.signal を渡している場合はそれも合成する(どちらが先に
 * abortしてもフェッチ全体がabortされ、タイマー/リスナーは finally で必ず解放する)。
 */
export function withFetchTimeout(
  baseFetch: typeof fetch,
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS,
): typeof fetch {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new SupabaseFetchTimeoutError(timeoutMs)), timeoutMs)

    const externalSignal = init.signal
    let onExternalAbort: (() => void) | undefined
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason)
      } else {
        onExternalAbort = () => controller.abort(externalSignal.reason)
        externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      }
    }

    try {
      return await baseFetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    }
  }
}

/** PII を含まない構造化ログ(コンポーネント名/関数名のみ。ユーザーID・cookie等は渡さないこと)。 */
export function logSupabaseTimeout(context: string, err: unknown): void {
  const isTimeout = isSupabaseTimeoutError(err)
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[supabase-timeout] context=${context} timeout=${isTimeout} message=${message}`)
}
