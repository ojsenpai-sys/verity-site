import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout'

// cookie/session に依存しない共通 Supabase クライアント。
// unstable_cache のコールバック内では cookies() 等の dynamic API が使えないため、
// グローバルキャッシュ対象のデータ取得はこのクライアントを使う（Phase 3.2.4 worksRanking.ts
// / fastestReleases.ts 等で個別実装されていたのと同一パターンを Phase 3.2.6 で共通化）。
// 既存の個別実装（11箇所）は今回リファクタしない — 新規のキャッシュ対象取得のみここに寄せる。

let _client: SupabaseClient | null = null

export function getStatelessSupabaseClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const timedFetch = withFetchTimeout(fetch, SUPABASE_FETCH_TIMEOUT_MS)
  _client = createSupabaseClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init = {}) => timedFetch(input, { ...init, cache: 'no-store' }) },
  })
  return _client
}
