import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// ── 定数 ─────────────────────────────────────────────────────────────

const INTERNAL_BASE = 'http://127.0.0.1:3000'

const AGE_GATE_COOKIE = 'verity_age_gate'

// SEO クローラー UA — 年齢ゲートをバイパスしてインデックスを維持する
const BOT_UA =
  /googlebot|bingbot|yandexbot|baiduspider|duckduckbot|slurp|facebot|ia_archiver|twitterbot|linkedinbot|discordbot|facebookexternalhit|embedly|pinterest|applebot|semrushbot|ahrefsbot|mj12bot|dotbot|rogerbot|exabot|sogou|360spider/i

// 外部ドメイン → siteKey マッピング
const BRAND_MAP: Record<string, string> = {
  'verity-official.com':     'verity',
  'www.verity-official.com': 'verity',
}

// NEXT_PUBLIC_SITE_URL からデフォルト siteKey を導出（ビルド時定数）
// Apache が Host を localhost に書き換えてしまう環境でのフォールバック
const DEFAULT_SITE_KEY: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  if (!raw) return null
  try {
    return BRAND_MAP[new URL(raw).hostname.toLowerCase()] ?? null
  } catch { return null }
})()

// ── ヘルパー ─────────────────────────────────────────────────────────

function forceHttpHeaders(request: NextRequest): Headers {
  const h = new Headers(request.headers)
  h.set('x-forwarded-proto', 'http')
  return h
}

function resolveSiteKey(request: NextRequest): string | null {
  const fwdHost = (request.headers.get('x-forwarded-host') ?? '').split(':')[0].toLowerCase()
  if (fwdHost && BRAND_MAP[fwdHost]) return BRAND_MAP[fwdHost]

  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase()
  if (BRAND_MAP[host]) return BRAND_MAP[host]

  return DEFAULT_SITE_KEY
}

// ── ルーティングロジック（同期）──────────────────────────────────────

// SEO・認証に必要なルート直下パス — リライトせず直接サーブする
const SEO_PASSTHROUGH = new Set(['/sitemap.xml', '/robots.txt'])

function isSeoPassthrough(pathname: string): boolean {
  return SEO_PASSTHROUGH.has(pathname) || pathname.startsWith('/.well-known/')
}

function routeRequest(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl
  const siteKey = resolveSiteKey(request)

  console.log('[middleware] Request URL:', request.url)
  console.log(`[proxy] host="${request.headers.get('host') ?? ''}" x-forwarded-host="${request.headers.get('x-forwarded-host') ?? ''}" x-forwarded-proto="${request.headers.get('x-forwarded-proto') ?? ''}"`)
  console.log(`[proxy] path="${pathname}" search="${search}" site=${siteKey ?? 'none'}`)

  // SEO必須パスはリライトせずそのまま通す
  if (isSeoPassthrough(pathname)) {
    console.log(`[proxy] seo-passthrough: "${pathname}"`)
    return NextResponse.next({ request: { headers: forceHttpHeaders(request) } })
  }

  if (!siteKey) {
    return NextResponse.next({ request: { headers: forceHttpHeaders(request) } })
  }

  if (pathname === '/index.html') {
    const rewriteUrl  = new URL(INTERNAL_BASE + `/${siteKey}`)
    rewriteUrl.search = search
    console.log(`[proxy] index.html → "${rewriteUrl.href}"`)
    return NextResponse.rewrite(rewriteUrl, { request: { headers: forceHttpHeaders(request) } })
  }

  if (pathname === `/${siteKey}` || pathname.startsWith(`/${siteKey}/`)) {
    console.log(`[proxy] pass-through: already under /${siteKey}`)
    return NextResponse.next({ request: { headers: forceHttpHeaders(request) } })
  }

  const rewrittenPath = pathname === '/' ? `/${siteKey}` : `/${siteKey}${pathname}`
  const rewriteUrl    = new URL(INTERNAL_BASE + rewrittenPath)
  rewriteUrl.search   = search

  console.log(`[proxy] rewrite: "${pathname}${search}" → "${rewriteUrl.href}"`)
  return NextResponse.rewrite(rewriteUrl, { request: { headers: forceHttpHeaders(request) } })
}

// ── 有効パスを算出（ルーティング後のパスを事前計算） ─────────────────

function getEffectivePath(request: NextRequest): string {
  const { pathname } = request.nextUrl
  const siteKey = resolveSiteKey(request)
  if (!siteKey) return pathname
  if (isSeoPassthrough(pathname)) return pathname
  if (pathname === '/index.html') return `/${siteKey}`
  if (pathname === `/${siteKey}` || pathname.startsWith(`/${siteKey}/`)) return pathname
  return pathname === '/' ? `/${siteKey}` : `/${siteKey}${pathname}`
}

// ── 年齢確認ガード ────────────────────────────────────────────────────

function ageGateGuard(
  request:       NextRequest,
  effectivePath: string,
): NextResponse | null {
  // /verity 配下のコンテンツページのみ対象
  if (!effectivePath.startsWith('/verity/')) return null

  // 対象外: API・認証・管理・/verity ルート（モーダル表示先・無限ループ防止）
  if (
    effectivePath.startsWith('/verity/api') ||
    effectivePath.startsWith('/verity/auth') ||
    effectivePath.startsWith('/verity/admin')
  ) return null

  // クローラーはバイパス（SEO インデックスを維持）
  const ua = request.headers.get('user-agent') ?? ''
  if (BOT_UA.test(ua)) return null

  // Cookie 確認
  if (request.cookies.get(AGE_GATE_COOKIE)?.value === 'verified') return null

  // 未確認: /verity へリダイレクト（元パスを next パラメータで保持）
  const target = new URL('/verity', request.url)
  target.searchParams.set('next', effectivePath)
  return NextResponse.redirect(target)
}

// ── 管理者ガード ──────────────────────────────────────────────────────

function adminGuard(
  request:       NextRequest,
  effectivePath: string,
  userEmail:     string | null | undefined,
): NextResponse | null {
  if (!effectivePath.startsWith('/verity/admin')) return null

  const adminEmail = process.env.ADMIN_EMAIL
  const isAdmin    = !!userEmail && !!adminEmail && userEmail === adminEmail
  const loginUrl   = new URL('/verity/admin/login', request.url)

  // ログインページ: 既に管理者 → ダッシュボードへ
  if (effectivePath === '/verity/admin/login') {
    if (isAdmin) return NextResponse.redirect(new URL('/verity/admin', request.url))
    return null
  }

  // 未ログイン
  if (!userEmail) return NextResponse.redirect(loginUrl)

  // ログイン済みだが管理者でない
  if (!isAdmin) {
    loginUrl.searchParams.set('error', 'unauthorized')
    return NextResponse.redirect(loginUrl)
  }

  return null
}

// ── メイン（Next.js 16 proxy エントリポイント）─────────────────────

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Supabase セッションリフレッシュ
  // setAll で更新されたクッキーを収集し、ルーティングレスポンスに付与する
  const updatedCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            updatedCookies.push({ name, value, options: options as Record<string, unknown> })
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ── 管理者ガード（ルーティング前に判定） ────────────────────────────
  const effectivePath = getEffectivePath(request)
  const guardResponse = adminGuard(request, effectivePath, user?.email)
  if (guardResponse) {
    updatedCookies.forEach(({ name, value, options }) => {
      guardResponse.cookies.set(name, value, options as Parameters<typeof guardResponse.cookies.set>[2])
    })
    return guardResponse
  }

  // ── 年齢確認ガード ───────────────────────────────────────────────────
  const ageGateResponse = ageGateGuard(request, effectivePath)
  if (ageGateResponse) {
    updatedCookies.forEach(({ name, value, options }) => {
      ageGateResponse.cookies.set(name, value, options as Parameters<typeof ageGateResponse.cookies.set>[2])
    })
    return ageGateResponse
  }

  // ── ドメイン → ブランドルーティング ─────────────────────────────────
  const response = routeRequest(request)

  // セッションクッキーをレスポンスに付与
  updatedCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })

  return response
}

export const config = {
  matcher: [
    /*
     * SEO必須パス（sitemap.xml, robots.txt, .well-known/）と静的アセットを除外。
     * 名前による明示除外（sitemap\.xml|robots\.txt|\.well-known）を先に列挙し、
     * 拡張子による除外（\.txt|\.xml|...）を後続フォールバックとして残す。
     */
    '/((?!_next/|sitemap\\.xml$|robots\\.txt$|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)',
  ],
}
