import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL     ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// PKCE フロー（OAuth / Google / X ログイン用）
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Implicit フロー（マジックリンク OTP 専用）
// スマホのインアプリブラウザは Cookie が隔離されるため PKCE が失敗する。
// Implicit フローはトークンをハッシュフラグメントで渡すので code_verifier が不要。
export function createImplicitClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit' },
  })
}
