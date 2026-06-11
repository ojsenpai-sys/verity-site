/**
 * GA4 Data API (Realtime) サービス層
 *
 * 環境変数:
 *   GOOGLE_GA4_PROPERTY_ID          — GA4 プロパティ ID（例: "123456789"）
 *   GOOGLE_GA4_SERVICE_ACCOUNT_JSON — サービスアカウント JSON（未設定時は GOOGLE_SC_SERVICE_ACCOUNT_JSON にフォールバック）
 *
 * 未設定 or API エラー時はリアルなデモデータにフォールバックする。
 */

import { createSign } from 'crypto'

// ── 型 ────────────────────────────────────────────────────────────────────────

export type TargetEvent = 'page_view' | 'actress_view' | 'video_view' | 'fanza_click'

export const TARGET_EVENTS: TargetEvent[] = [
  'page_view', 'actress_view', 'video_view', 'fanza_click',
]

export type GA4RealtimeResult = {
  events:    Partial<Record<TargetEvent, number>>
  isMock:    boolean
  fetchedAt: string   // ISO 8601
}

// ── デモデータ ────────────────────────────────────────────────────────────────
// 典型的な日中トラフィック / ファネル落ち率を再現

const MOCK_EVENTS: Record<TargetEvent, number> = {
  page_view:    178,
  actress_view:  52,
  video_view:    29,
  fanza_click:   11,
}

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
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    iat:   now,
    exp:   now + 3600,
  }))

  const signingInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const sig = b64url(sign.sign(sa.private_key))
  const jwt = `${signingInput}.${sig}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`)
  const { access_token } = await res.json() as { access_token: string }
  return access_token
}

// ── GA4 Realtime API 呼び出し ─────────────────────────────────────────────────

async function fetchRealtimeReport(
  token:      string,
  propertyId: string,
): Promise<Partial<Record<TargetEvent, number>>> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dimensions:   [{ name: 'eventName' }],
        metrics:      [{ name: 'eventCount' }],
        minuteRanges: [{ name: 'last30min', startMinutesAgo: 29, endMinutesAgo: 0 }],
      }),
    },
  )
  if (!res.ok) throw new Error(`GA4 Realtime API error (${res.status}): ${await res.text()}`)

  type ApiRow = {
    dimensionValues: { value: string }[]
    metricValues:    { value: string }[]
  }
  const data = await res.json() as { rows?: ApiRow[] }
  const events: Partial<Record<TargetEvent, number>> = {}

  for (const row of data.rows ?? []) {
    const name = row.dimensionValues[0]?.value as TargetEvent
    if ((TARGET_EVENTS as string[]).includes(name)) {
      events[name] = parseInt(row.metricValues[0]?.value ?? '0', 10)
    }
  }
  return events
}

// ── パブリック API ─────────────────────────────────────────────────────────────

export async function getGA4RealtimeData(): Promise<GA4RealtimeResult> {
  const saJson     = process.env.GOOGLE_GA4_SERVICE_ACCOUNT_JSON
                  ?? process.env.GOOGLE_SC_SERVICE_ACCOUNT_JSON
  const propertyId = process.env.GOOGLE_GA4_PROPERTY_ID
  const fetchedAt  = new Date().toISOString()

  if (!saJson || !propertyId) {
    return { events: MOCK_EVENTS, isMock: true, fetchedAt }
  }

  try {
    const token  = await getAccessToken(saJson)
    const events = await fetchRealtimeReport(token, propertyId)
    return { events, isMock: false, fetchedAt }
  } catch (err) {
    console.error('[GA4Realtime] API error, falling back to demo data:', err)
    return { events: MOCK_EVENTS, isMock: true, fetchedAt }
  }
}
