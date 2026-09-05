import type { SupabaseClient, User } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'

// Phase 3.2.5: supabase.auth.getUser() の障害耐性ヘルパー。
//
// @supabase/auth-js の実装(GoTrueClient._getUser)は、GoTrue自体が返す認定済みの
// AuthError（例: セッション無し = AuthSessionMissingError）は {data:{user:null}, error} という
// 非throwの形で返すが、それ以外の例外（fetchのAbortError/ネットワークエラー等 — つまり
// Phase 3.2 で追加した8秒timeoutが発火した場合を含む）はAuthErrorとして認識されず、
// そのままthrowされる。呼び出し側でtry/catchしていないと、Auth基盤の一時的な障害だけで
// ページ全体がクラッシュする（実際にlayout.tsx等で発生していた）。
//
// 本ヘルパーは3状態を明確に区別する:
//   'authenticated' — 確実にログイン済み
//   'anonymous'     — 確実に未ログイン（GoTrueが正常応答し、セッション/ユーザーが無い）
//   'unavailable'   — Auth基盤の障害/timeout（ログイン状態は不明。ログアウトとして扱わない）
//
// 呼び出し側の方針:
//   PUBLIC/AUTH-AWARE: anonymous と unavailable を同じ「未ログイン相当UI」として扱ってよい
//                       （保護データを一切取得・表示しないという条件下でのみ安全）。
//   PROTECTED（My Page等）: anonymous のみ「ログイン画面へリダイレクト」してよい。
//                       unavailable は絶対にconfirmed-logged-outと混同せず、
//                       リダイレクトもsignOutも行わず、安全なフォールバック表示に留める。
export type AuthUserResult =
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  | { status: 'unavailable' }

export async function safeGetUser(
  supabase: SupabaseClient,
  context: string,
): Promise<AuthUserResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user ? { status: 'authenticated', user } : { status: 'anonymous' }
  } catch (err) {
    // cookies()由来のDynamicServerError等、Next.js内部の制御フロー例外は握り潰さない。
    unstable_rethrow(err)
    console.error(`[auth-unavailable] context=${context} message=${err instanceof Error ? err.message : String(err)}`)
    return { status: 'unavailable' }
  }
}
