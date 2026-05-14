import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { computeUnlocks } from '@/lib/titles'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

const BASE_URL = 'https://verity-official.com'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  // ── Supabase auth サーバーからのエラーリダイレクト処理 ──────────────────────
  // スキャナ・IAB・期限切れ等で Supabase が ?error=otp_expired を返す場合を処理
  const supabaseError = searchParams.get('error')
  if (supabaseError) {
    const errorCode = searchParams.get('error_code') ?? supabaseError
    console.error(
      '[auth/callback] Supabase auth error:',
      supabaseError,
      '|',
      searchParams.get('error_description') ?? '',
    )
    return NextResponse.redirect(
      new URL(`/verity/login?error=${encodeURIComponent(errorCode)}`, BASE_URL),
    )
  }

  const code = searchParams.get('code')
  // next パラメータは自サイト内のパスのみ許可（オープンリダイレクト防止）
  const rawNext = searchParams.get('next') ?? ''
  const next    = rawNext.startsWith('/verity') ? rawNext : '/verity/profile'

  if (!code) {
    return NextResponse.redirect(new URL('/verity/login?error=missing_code', BASE_URL))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  ()             => cookieStore.getAll(),
        setAll:  (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    }
  )

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error(
      '[auth/callback] exchangeCodeForSession error:',
      exchangeError.message,
      '| code:', exchangeError.code ?? '(none)',
    )
    // Supabase のエラーコードをそのまま渡す（otp_expired / pkce_verification_failed 等）
    const errCode = exchangeError.code ?? 'auth_error'
    return NextResponse.redirect(
      new URL(`/verity/login?error=${encodeURIComponent(errCode)}`, BASE_URL),
    )
  }

  // ── プロフィール初期化（初回ログイン時のみ） ──────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('user_id, created_at, titles_data, favorite_actress_ids')
      .eq('user_id', user.id)
      .eq('brand_id', BRAND_ID)
      .maybeSingle()

    if (!existing) {
      const now = new Date().toISOString()
      await supabase.from('profiles').insert({
        user_id:     user.id,
        brand_id:    BRAND_ID,
        title:       'newcomer',
        titles_data: [{ id: 'newcomer', unlocked_at: now }],
      })
    } else {
      const currentUnlocked = (existing.titles_data as { id: string; unlocked_at: string }[]).map(t => t.id)
      const newTitleIds = computeUnlocks({
        createdAt:        new Date(existing.created_at),
        favCount:         (existing.favorite_actress_ids as string[]).length,
        existingUnlocked: currentUnlocked,
      })
      if (newTitleIds.length > 0) {
        const now = new Date().toISOString()
        const additions = newTitleIds.map(id => ({ id, unlocked_at: now }))
        await supabase.from('profiles').update({
          titles_data: [...(existing.titles_data as object[]), ...additions],
        })
        .eq('user_id', user.id)
        .eq('brand_id', BRAND_ID)
      }
    }
  }

  return NextResponse.redirect(new URL(next, BASE_URL))
}
