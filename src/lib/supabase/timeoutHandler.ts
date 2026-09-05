import { unstable_rethrow } from 'next/navigation'
import { logSupabaseTimeout } from './timeout'

/**
 * Supabase呼び出しを囲む catch ブロックの先頭で必ず呼ぶこと。
 * Next.js の内部制御フロー例外(cookies()由来の DynamicServerError、redirect()/notFound()、
 * PPR postpone 等)を unstable_rethrow() で再送出してからログを記録する — でなければ
 * これらの内部例外を握りつぶし、静的/動的レンダリング判定やredirect/notFoundの動作を壊しうる。
 *
 * next/navigation に依存するため、この関数だけ ./timeout.ts (純粋ロジック・node --test対象)
 * から分離している。
 */
export function handleSupabaseFetchError(context: string, err: unknown): void {
  unstable_rethrow(err)
  logSupabaseTimeout(context, err)
}
