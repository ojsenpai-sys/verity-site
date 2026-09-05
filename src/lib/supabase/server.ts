import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from './timeout'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[supabase/server] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// 2026-09-05 インシデント再発防止: Supabaseへのfetchが無期限にハングしないよう上限を設ける(STEP2)。
const timedFetch = withFetchTimeout(fetch, SUPABASE_FETCH_TIMEOUT_MS)

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: {
        // Next.js Data Cache を完全に回避: force-dynamic ルートでも明示的に no-store
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
          timedFetch(url, { ...options, cache: 'no-store' }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — cookies can't be set, ignore
          }
        },
      },
    }
  )
}
