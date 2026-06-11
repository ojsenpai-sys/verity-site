/**
 * Google Search Console API サービス層
 *
 * 環境変数が設定されていれば実際のAPIを叩く。
 * 未設定 or エラー時はリアルなデモデータにフォールバックする。
 *
 * 必要な環境変数:
 *   GOOGLE_SC_SERVICE_ACCOUNT_JSON  サービスアカウントのJSONキーファイル（文字列化）
 *   GOOGLE_SC_SITE_URL              例: "https://verity-official.com/"
 */

import { createSign } from 'crypto'

// ── 型 ────────────────────────────────────────────────────────────────────────

export type SearchConsoleRow = {
  query:       string
  page:        string   // ランディングページの絶対 or 相対URL
  clicks:      number
  impressions: number
  ctr:         number   // 0.0〜1.0（例: 0.05 = 5%）
  position:    number   // 平均掲載順位（小さいほど上位）
}

export type SearchConsoleResult = {
  rows:   SearchConsoleRow[]
  isMock: boolean   // デモデータ使用中なら true
}

// ── デモデータ ────────────────────────────────────────────────────────────────
// 「高インプレッション × 低CTR × 好順位」のリアルな分布を再現
// 穴場条件（position≤15 / impressions≥30 / ctr<1%）に引っかかるものを意図的に混在
const MOCK_ROWS: SearchConsoleRow[] = [
  // ★ 穴場候補（好順位なのにCTR不振）
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
  // ★ 高CTR行（穴場フィルタに引っかからない — 健全な行）
  { query: 'verity av 女優',               page: '/verity/',                              clicks: 42, impressions: 180, ctr: 0.2333, position: 1.8  },
  { query: 'verity 篠崎沙帆',              page: '/verity/actresses/dmm-actress-1154783', clicks: 28, impressions: 95,  ctr: 0.2947, position: 1.2  },
  { query: 'verity 公式',                  page: '/verity/',                              clicks: 35, impressions: 120, ctr: 0.2917, position: 1.5  },
  { query: '篠崎沙帆 プロフィール',        page: '/verity/actresses/dmm-actress-1154783', clicks: 21, impressions: 175, ctr: 0.1200, position: 3.2  },
  // ★ 順位圏外（15位超）
  { query: 'av 女優 動画 2025',            page: '/verity/',                              clicks: 1,  impressions: 820, ctr: 0.0012, position: 22.4 },
  { query: 'fanza 人気 av',                page: '/verity/',                              clicks: 2,  impressions: 650, ctr: 0.0031, position: 18.6 },
  // ★ インプレッション不足（30未満）
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

  const now    = Math.floor(Date.now() / 1000)
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

  const jwt = `${signingInput}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`)
  }

  const { access_token } = await tokenRes.json() as { access_token: string }
  return access_token
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

// ── パブリック API ─────────────────────────────────────────────────────────────

export async function getSearchConsoleData(): Promise<SearchConsoleResult> {
  const saJson  = process.env.GOOGLE_SC_SERVICE_ACCOUNT_JSON
  const siteUrl = process.env.GOOGLE_SC_SITE_URL

  if (!saJson || !siteUrl) {
    return { rows: MOCK_ROWS, isMock: true }
  }

  try {
    const token = await getAccessToken(saJson)
    const rows  = await fetchFromApi(token, siteUrl)
    return { rows, isMock: false }
  } catch (err) {
    console.error('[SearchConsole] API error, falling back to demo data:', err)
    return { rows: MOCK_ROWS, isMock: true }
  }
}

// ── 穴場抽出ユーティリティ ────────────────────────────────────────────────────

export const TREASURE_CONFIG = {
  maxPosition:    15,   // 上位15位以内
  minImpressions: 30,   // 月30インプレッション以上
  maxCtr:         0.01, // CTR 1%未満
  targetCtr:      0.03, // 健全なCTR基準（3%）
} as const

/** 穴場スコア: 健全CTR（3%）時の想定クリックと現在のクリックの差 */
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

  // 順位が良いのにCTRが壊滅的 → タイトルが魅力不足
  if (row.position <= 5 && row.ctr < 0.01) {
    badges.push({ label: 'タイトル要改善', color: '#ff5533' })
  } else if (row.position <= 10 && row.ctr < 0.01) {
    badges.push({ label: 'タイトル要改善', color: '#fbbf24' })
  }

  // 大量露出なのにほぼ無視 → ディスクリプションが機能していない
  if (row.impressions >= 150 && row.ctr < 0.005) {
    badges.push({ label: 'meta description要改善', color: '#aa77ff' })
  }

  // 超高インプ × 低CTR → 最優先対応
  if (row.impressions >= 400 && row.ctr < 0.01) {
    badges.push({ label: '🔥 強化優先', color: '#ff5533' })
  }

  return badges
}

// ── タイトル改善案 ────────────────────────────────────────────────────────────
// 実装済みの自動生成ロジック（actresses/[id]/page.tsx・articles/[slug]/page.tsx）と
// フォーマットを揃えることで、SEO改善ボードの提案が現行タイトルと一貫する。

export function suggestTitle(query: string, page: string): string {
  const month = new Date().getMonth() + 1
  const name  = query.split(/\s/)[0]   // クエリ先頭語（女優名など）

  const isActress = page.includes('/actresses/')
  const isTop     = page === '/verity/' || page.endsWith('/verity')
  const isActList = page.includes('/actresses') && !page.includes('/actresses/')

  // ── 女優ページ: 【N月最新】フォーマット ─────────────────────────────────────
  if (isActress) {
    if (/セール|安い|100円/.test(query))
      return `【${month}月最新】${name}のセール作品まとめ！業界最安値でFANZA割引中【VERITY】`
    if (/fanza|動画/.test(query))
      return `【${month}月最新】${name}の動画・サンプルあり出演作一覧【VERITY】`
    if (/最新/.test(query))
      return `【${month}月最新】${name}の最新作！予約・発売情報まとめ【VERITY】`
    // 作品一覧系クエリ・汎用 — 自動生成タイトルと完全一致
    return `【${month}月最新】${name}の神作・出演動画まとめ！今すぐ使えるセール作品・無料サンプル情報【VERITY】`
  }

  // ── 女優一覧ページ ──────────────────────────────────────────────────────────
  if (isActList) return `人気AV女優一覧【${month}月版】篠崎沙帆・河北彩花ほか | VERITY`

  // ── トップページ ─────────────────────────────────────────────────────────────
  if (isTop) {
    if (/ランキング/.test(query))
      return `${query.replace(/\s*\d{4}年?\s*/, '')}【VERITYが厳選 ${month}月随時更新】`
    if (/おすすめ/.test(query))
      return `${query.replace(/\s*\d{4}年?\s*/, '')}【${month}月版】FANZAセール情報つき | VERITY`
    return `${query} — VERITY公式まとめ【${month}月最新版】`
  }

  // ── 記事ページ: buildSeoTitle と同一優先順位 ─────────────────────────────────
  if (/VR/.test(query))
    return `【🥽VR対応・脳汁炸裂】${query} - 圧倒的没入感のサンプル動画｜VERITY`
  if (/100円|セール|安い/.test(query))
    return `【限定割引：100円SALE】${query} - 業界最安値で今すぐ視聴｜VERITY`
  return `【最速配信】${query} - 無料動画サンプル・出演女優情報｜VERITY`
}
