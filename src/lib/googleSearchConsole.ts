/**
 * Google Search Console API サービス層
 *
 * 認証方式（優先順位順）:
 *   ① OAuth2 リフレッシュトークン方式（推奨）
 *      → Search Console へのサービスアカウント登録不要
 *      → scripts/get-gsc-token.mjs を一度だけ実行して取得
 *      必要な環境変数:
 *        GOOGLE_OAUTH_CLIENT_ID      OAuth2 クライアントID
 *        GOOGLE_OAUTH_CLIENT_SECRET  OAuth2 クライアントシークレット
 *        GOOGLE_OAUTH_REFRESH_TOKEN  リフレッシュトークン
 *        GOOGLE_SC_SITE_URL          例: "https://verity-official.com/"
 *
 *   ② サービスアカウント方式（後方互換）
 *      → Search Console でサービスアカウントのメールを登録済みの場合のみ
 *      必要な環境変数:
 *        GOOGLE_SC_SERVICE_ACCOUNT_JSON  サービスアカウントJSONキー（文字列化）
 *        GOOGLE_SC_SITE_URL
 *
 *   未設定 / エラー時はデモデータで動作する。
 *
 *   その他:
 *     SUPABASE_SERVICE_ROLE_KEY  キャッシュ読み書きに使用
 */

import { createSign } from 'crypto'
import { createClient as createSvcClient } from '@supabase/supabase-js'

// ── 型 ────────────────────────────────────────────────────────────────────────

export type SearchConsoleRow = {
  query:          string
  page:           string
  clicks:         number
  impressions:    number
  ctr:            number
  position:       number
  // キャッシュから読んだ場合のみ付加される enriched フィールド
  actressName?:   string
  actressId?:     string
  suggestedTitle?: string
  altTitles?:     string[]
  suggestionId?:  string   // seo_suggestions.id（適用ボタンに使用）
  isApplied?:     boolean
}

export type SearchConsoleResult = {
  rows:      SearchConsoleRow[]
  isMock:    boolean
  cachedAt?: string   // ISO timestamp of last refresh
}

// ── デモデータ ────────────────────────────────────────────────────────────────

const MOCK_ROWS: SearchConsoleRow[] = [
  { query: '篠崎沙帆 作品一覧',           page: '/verity/actresses/dmm-actress-1154783', clicks: 4,  impressions: 520, ctr: 0.0077, position: 6.2  },
  { query: '篠崎沙帆 最新作 2025',         page: '/verity/actresses/dmm-actress-1154783', clicks: 3,  impressions: 412, ctr: 0.0073, position: 4.8  },
  { query: '人気 av 女優 ランキング 2025', page: '/verity/',                              clicks: 4,  impressions: 680, ctr: 0.0059, position: 8.9  },
  { query: 'av 女優 おすすめ 2025',        page: '/verity/',                              clicks: 3,  impressions: 510, ctr: 0.0059, position: 11.3 },
  { query: 'av 最新作 おすすめ',           page: '/verity/',                              clicks: 2,  impressions: 380, ctr: 0.0053, position: 13.5 },
  { query: '篠崎沙帆 fanza',               page: '/verity/actresses/dmm-actress-1154783', clicks: 0,  impressions: 195, ctr: 0.0000, position: 5.8  },
  { query: 'おすすめ av 女優 日本人',      page: '/verity/',                              clicks: 1,  impressions: 290, ctr: 0.0034, position: 12.1 },
  { query: '河北彩花 セール',              page: '/verity/actresses/dmm-actress-1026028', clicks: 0,  impressions: 142, ctr: 0.0000, position: 5.1  },
  { query: '単体 av 女優 人気 ランキング', page: '/verity/',                              clicks: 2,  impressions: 430, ctr: 0.0047, position: 10.8 },
  { query: 'fanza セール av 2025',         page: '/verity/',                              clicks: 3,  impressions: 310, ctr: 0.0097, position: 7.2  },
  { query: 'av 女優 一覧 2025',            page: '/verity/actresses',                     clicks: 1,  impressions: 260, ctr: 0.0038, position: 14.6 },
  { query: '篠崎沙帆 動画 無料',           page: '/verity/actresses/dmm-actress-1154783', clicks: 0,  impressions: 88,  ctr: 0.0000, position: 6.9  },
  { query: '河北彩花 最新 2025',           page: '/verity/actresses/dmm-actress-1026028', clicks: 1,  impressions: 118, ctr: 0.0085, position: 8.5  },
  { query: '河北彩花 動画 一覧',           page: '/verity/actresses/dmm-actress-1026028', clicks: 1,  impressions: 160, ctr: 0.0063, position: 9.4  },
  { query: 'av 女優 プロフィール 一覧',    page: '/verity/actresses',                     clicks: 1,  impressions: 210, ctr: 0.0048, position: 13.2 },
  { query: '篠崎沙帆 セール 安い',         page: '/verity/actresses/dmm-actress-1154783', clicks: 0,  impressions: 75,  ctr: 0.0000, position: 4.5  },
  { query: 'verity av 女優',               page: '/verity/',                              clicks: 42, impressions: 180, ctr: 0.2333, position: 1.8  },
  { query: 'verity 篠崎沙帆',              page: '/verity/actresses/dmm-actress-1154783', clicks: 28, impressions: 95,  ctr: 0.2947, position: 1.2  },
  { query: 'verity 公式',                  page: '/verity/',                              clicks: 35, impressions: 120, ctr: 0.2917, position: 1.5  },
  { query: '篠崎沙帆 プロフィール',        page: '/verity/actresses/dmm-actress-1154783', clicks: 21, impressions: 175, ctr: 0.1200, position: 3.2  },
  { query: 'av 女優 動画 2025',            page: '/verity/',                              clicks: 1,  impressions: 820, ctr: 0.0012, position: 22.4 },
  { query: 'fanza 人気 av',                page: '/verity/',                              clicks: 2,  impressions: 650, ctr: 0.0031, position: 18.6 },
  { query: '篠崎沙帆 ファン',              page: '/verity/actresses/dmm-actress-1154783', clicks: 1,  impressions: 12,  ctr: 0.0833, position: 4.1  },
]

// ── JWT ユーティリティ ────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const base64 = Buffer.isBuffer(input)
    ? input.toString('base64')
    : Buffer.from(input).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }

  const now     = Math.floor(Date.now() / 1000)
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    iat:   now,
    exp:   now + 3600,
  }))

  const signingInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = b64url(sign.sign(sa.private_key))

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${signingInput}.${signature}`,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`)
  }

  const { access_token } = await tokenRes.json() as { access_token: string }
  return access_token
}

// ── OAuth2 リフレッシュトークン方式 ───────────────────────────────────────────
// サービスアカウントを Search Console に登録しなくても
// オーナーアカウントの refresh_token だけで動作する。

async function getAccessTokenOAuth(
  clientId:     string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OAuth2 token refresh failed (${res.status}): ${body}`)
  }

  const data = await res.json() as { access_token?: string; error?: string; error_description?: string }
  if (!data.access_token) {
    throw new Error(`OAuth2: no access_token — ${data.error}: ${data.error_description}`)
  }
  return data.access_token
}

// ── Search Console API 呼び出し ───────────────────────────────────────────────

async function fetchFromApi(accessToken: string, siteUrl: string): Promise<SearchConsoleRow[]> {
  const endDate   = new Date().toISOString().slice(0, 10)
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query', 'page'],
        rowLimit:   1000,
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Search Console API error (${res.status}): ${body}`)
  }

  type ApiRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }
  const data = await res.json() as { rows?: ApiRow[] }

  return (data.rows ?? []).map(row => ({
    query:       row.keys[0] ?? '',
    page:        row.keys[1] ?? '',
    clicks:      row.clicks,
    impressions: row.impressions,
    ctr:         row.ctr,
    position:    row.position,
  }))
}

// ── パブリック API（直接取得） ─────────────────────────────────────────────────

export async function getSearchConsoleData(): Promise<SearchConsoleResult> {
  const siteUrl = process.env.GOOGLE_SC_SITE_URL
  if (!siteUrl) return { rows: MOCK_ROWS, isMock: true }

  // ① OAuth2 リフレッシュトークン方式（推奨 — SA登録不要）
  const clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

  if (clientId && clientSecret && refreshToken) {
    try {
      const token = await getAccessTokenOAuth(clientId, clientSecret, refreshToken)
      const rows  = await fetchFromApi(token, siteUrl)
      return { rows, isMock: false }
    } catch (err) {
      console.error('[SearchConsole] OAuth2 error:', err)
    }
  }

  // ② サービスアカウント方式（後方互換）
  const saJson = process.env.GOOGLE_SC_SERVICE_ACCOUNT_JSON
  if (saJson) {
    try {
      const token = await getAccessToken(saJson)
      const rows  = await fetchFromApi(token, siteUrl)
      return { rows, isMock: false }
    } catch (err) {
      console.error('[SearchConsole] Service account error:', err)
    }
  }

  return { rows: MOCK_ROWS, isMock: true }
}

// ── Supabase キャッシュ経由取得 ───────────────────────────────────────────────
// seo-refresh API ルートが書き込んだ最新バッチを読む（TTL: 6時間）。
// キャッシュなし or 期限切れの場合は直接APIにフォールバック。

const CACHE_TTL_MS = 6 * 60 * 60 * 1000  // 6h

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function getSearchConsoleDataCached(): Promise<SearchConsoleResult> {
  try {
    const db = svc()

    const { data: meta } = await db
      .from('seo_cache_meta')
      .select('*')
      .eq('singleton', 1)
      .single()

    if (meta?.batch_id && meta.fetched_at) {
      const ageMs = Date.now() - new Date(meta.fetched_at as string).getTime()
      if (ageMs < CACHE_TTL_MS) {
        const { data: cached } = await db
          .from('seo_suggestions')
          .select('*')
          .eq('batch_id', meta.batch_id)
          .order('opportunity', { ascending: false })
          .limit(500)

        if (cached && cached.length > 0) {
          type CachedRow = {
            id: string; query: string; page: string; clicks: number; impressions: number
            ctr: number; position: number; actress_name: string | null; actress_id: string | null
            suggested_title: string | null; alt_titles: string[]; is_applied: boolean
          }
          return {
            rows: (cached as CachedRow[]).map(r => ({
              query:          r.query,
              page:           r.page,
              clicks:         r.clicks,
              impressions:    r.impressions,
              ctr:            r.ctr,
              position:       r.position,
              actressName:    r.actress_name ?? undefined,
              actressId:      r.actress_id ?? undefined,
              suggestedTitle: r.suggested_title ?? undefined,
              altTitles:      r.alt_titles ?? [],
              suggestionId:   r.id,
              isApplied:      r.is_applied ?? false,
            })),
            isMock:   !(meta.is_real as boolean),
            cachedAt: meta.fetched_at as string,
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SC cache] read failed, falling back to direct API:', err)
  }

  return getSearchConsoleData()
}

// ── 穴場抽出ユーティリティ ────────────────────────────────────────────────────

export const TREASURE_CONFIG = {
  maxPosition:    15,   // 上位15位以内
  minImpressions: 50,   // 月50インプレッション以上（旧30→50に変更）
  maxCtr:         0.01, // CTR 1%未満
  targetCtr:      0.03, // 健全なCTR基準（3%）
} as const

/** 穴場スコア: 健全CTR時の想定クリックと現在のクリックの差 */
export function opportunityScore(row: SearchConsoleRow): number {
  return Math.round(row.impressions * TREASURE_CONFIG.targetCtr - row.clicks)
}

export function isTreasure(row: SearchConsoleRow): boolean {
  return (
    row.position    <= TREASURE_CONFIG.maxPosition    &&
    row.impressions >= TREASURE_CONFIG.minImpressions &&
    row.ctr         <  TREASURE_CONFIG.maxCtr
  )
}

// ── 改善バッジ生成 ────────────────────────────────────────────────────────────

export type ImprovementBadge = { label: string; color: string }

export function getImprovementBadges(row: SearchConsoleRow): ImprovementBadge[] {
  const badges: ImprovementBadge[] = []

  if (row.position <= 5 && row.ctr < 0.01) {
    badges.push({ label: 'タイトル要改善', color: '#ff5533' })
  } else if (row.position <= 10 && row.ctr < 0.01) {
    badges.push({ label: 'タイトル要改善', color: '#fbbf24' })
  }

  if (row.impressions >= 150 && row.ctr < 0.005) {
    badges.push({ label: 'meta description要改善', color: '#aa77ff' })
  }

  if (row.impressions >= 400 && row.ctr < 0.01) {
    badges.push({ label: '🔥 強化優先', color: '#ff5533' })
  }

  return badges
}

// ── タイトル改善案（複数バリアント） ─────────────────────────────────────────
// 検索クエリの intent を分類し、CTRを最大化するタイトル候補を3件返す。
// actressName が渡された場合は query の先頭語推測より優先する。

type Intent = 'sale' | 'video' | 'latest' | 'ranking' | 'profile' | 'generic'

function classifyIntent(query: string): Intent {
  if (/セール|安い|100円|割引/.test(query))             return 'sale'
  if (/動画|fanza|無料|sample|サンプル/i.test(query))   return 'video'
  if (/最新|new|新作/i.test(query))                     return 'latest'
  if (/ランキング|rank|人気|おすすめ/i.test(query))     return 'ranking'
  if (/プロフィール|profile|生年月日|身長/i.test(query)) return 'profile'
  return 'generic'
}

/**
 * 3つのタイトル改善候補を返す（[0] がベスト）
 */
export function suggestTitles(
  query:       string,
  page:        string,
  actressName?: string,
): string[] {
  const now    = new Date()
  const month  = now.getMonth() + 1
  const year   = now.getFullYear()
  const name   = actressName ?? query.split(/[\s　]/)[0]
  const intent = classifyIntent(query)

  const isActress = page.includes('/actresses/') && !page.includes('/genres/')
  const isActList = page.includes('/actresses') && !isActress
  const isTop     = page === '/verity/' || page.endsWith('/verity') || page === '/'

  // ── 女優個別ページ ────────────────────────────────────────────────────────
  if (isActress) {
    switch (intent) {
      case 'sale':
        return [
          `【${month}月セール中】${name}の作品が最大80%OFF！FANZAで今すぐ視聴 | VERITY`,
          `${name} セール作品まとめ【${year}年${month}月版】期間限定割引中 | VERITY`,
          `【期間限定】${name}出演作品セール中 — 無料サンプル動画つき | VERITY`,
        ]
      case 'video':
        return [
          `【${month}月最新】${name}の動画一覧 — 無料サンプルあり・HD画質 | VERITY`,
          `${name} FANZAで視聴できる全動画まとめ【${year}年${month}月更新】`,
          `${name}の動画・出演作品完全一覧 — 無料サンプルつき | VERITY`,
        ]
      case 'latest':
        return [
          `【${year}年${month}月最新作】${name}の新作・予約情報まとめ | VERITY`,
          `${name} 最新作${year}年${month}月版 — 発売日・予約・サンプル一覧 | VERITY`,
          `${name}の${month}月新作！予約受付中・発売スケジュール完全版 | VERITY`,
        ]
      case 'ranking':
        return [
          `【${month}月版】${name}の人気作品ランキング — ファンが選んだ神作TOP | VERITY`,
          `${name} おすすめ作品ランキング【${year}年${month}月最新】 | VERITY`,
          `${name}の代表作・神作ランキング — VERITYユーザー評価順 | VERITY`,
        ]
      case 'profile':
        return [
          `${name} プロフィール・出演全作品一覧【${year}年${month}月版】| VERITY`,
          `${name}（AV女優）プロフィール・代表作・最新情報まとめ | VERITY`,
          `【完全版】${name}のプロフィール・出演作品一覧 | VERITY`,
        ]
      default:
        return [
          `【${month}月最新】${name}の神作・出演動画まとめ！セール作品・無料サンプル情報 | VERITY`,
          `${name} 出演全作品一覧【${year}年${month}月更新】FANZAで視聴可能 | VERITY`,
          `${name}の作品一覧と人気ランキング【VERITY編集部が厳選・毎月更新】`,
        ]
    }
  }

  // ── 女優一覧ページ ────────────────────────────────────────────────────────
  if (isActList) {
    return [
      `人気AV女優一覧【${year}年${month}月最新版】プロフィール・代表作まとめ | VERITY`,
      `AV女優ランキング${year}年${month}月版 — FANZAで人気の女優を一挙紹介 | VERITY`,
      `AV女優完全データベース${year}年版 — 1,100名超の出演作品・プロフィール | VERITY`,
    ]
  }

  // ── トップページ ──────────────────────────────────────────────────────────
  if (isTop) {
    if (intent === 'ranking') {
      return [
        `AV女優人気ランキング【${year}年${month}月版】ユーザー評価 × FANZAデータ | VERITY`,
        `【${month}月最新】AV女優おすすめランキング — VERITYが選ぶ厳選作品 | VERITY`,
        `人気AV女優ランキング${year}年${month}月 — ファンが選ぶTOP女優 | VERITY`,
      ]
    }
    return [
      `${query} — VERITY公式まとめ【${year}年${month}月最新版】`,
      `【${month}月最新】${query} | FANZAデータ × 編集部厳選 | VERITY`,
      `${query}【${year}年版】VERITYがFANZAデータで徹底解説`,
    ]
  }

  // ── 記事ページ ────────────────────────────────────────────────────────────
  if (/VR/i.test(query)) {
    return [
      `【VR対応】${query} — 圧倒的没入感・無料サンプルあり | VERITY`,
      `【VR動画】${query} | HD画質・神作品 | VERITY`,
      `${query}【VR最新作】無料サンプル動画あり | VERITY`,
    ]
  }
  if (/100円|セール|安い/.test(query)) {
    return [
      `【限定割引】${query} — 今すぐ視聴可能・無料サンプルあり | VERITY`,
      `${query}【期間限定SALE中】FANZAで最安値 | VERITY`,
      `【${month}月SALE】${query} | VERITY`,
    ]
  }
  return [
    `【${month}月最新】${query} — 無料サンプル・出演女優情報 | VERITY`,
    `${query}【${year}年${month}月版】FANZAで今すぐ視聴 | VERITY`,
    `${query} | VERITYが厳選した神作品 | VERITY`,
  ]
}

/** 後方互換 — 最優先候補を1件返す */
export function suggestTitle(
  query:       string,
  page:        string,
  actressName?: string,
): string {
  return suggestTitles(query, page, actressName)[0]
}
