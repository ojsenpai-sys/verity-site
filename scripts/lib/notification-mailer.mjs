// ═════════════════════════════════════════════════════════════════════════════
// scripts/lib/notification-mailer.mjs — 通知メール共通基盤（Phase 4）
// ═════════════════════════════════════════════════════════════════════════════
// scripts/notify-actress-new-release.mjs（Phase 2）と scripts/notify-weekly-ranking.mjs
// （Phase 3）が個別に複製していた env読込・PostgREST/GoTrue呼び出し・Resend送信・
// unsubscribe token・sanitize処理をここへ集約する。
//
// この2スクリプトは同一デプロイ単位（deploy.shが scripts/ をまるごと転送）なので、
// src/lib/* 側とは共有せず、ここに閉じたモジュールとして完結させる
// （Next.jsアプリのビルドグラフとVPS常駐cronスクリプトの実行系を混在させない）。
//
// Phase 2/3スクリプト本体の未変更部分（env読込の呼び出し順・PostgRESTクエリ組み立て方・
// dry-run/test-user/冪等性ロジックの構造）は本モジュール抽出後も同一である必要があるため、
// 抽出時は関数シグネチャを変えず「そのまま移動」するに留めている。
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

// ── env ローダ（maker-sync.mjs 由来・逐語同一） ─────────────────────────────────
export function loadEnvFile(cwd, file) {
  try {
    for (const raw of fs.readFileSync(path.join(cwd, file), 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (k && process.env[k] === undefined) process.env[k] = v
    }
  } catch {}
}
export function loadEcosystemEnv(cwd, file) {
  try {
    const require = createRequire(import.meta.url)
    const cfg = require(path.join(cwd, file))
    const env = cfg?.apps?.[0]?.env ?? {}
    for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = String(v)
  } catch {}
}
export function loadAllEnv(cwd) {
  loadEnvFile(cwd, '.env.local'); loadEnvFile(cwd, '.env'); loadEcosystemEnv(cwd, 'ecosystem.config.js')
}

// ── 時刻ヘルパ ───────────────────────────────────────────────────────────────
export const jstIso = (d = new Date()) =>
  new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '') + '+09:00'
export const jstDateKey = (d = new Date()) => {
  const j = new Date(d.getTime() + 9 * 3600 * 1000)
  return j.toISOString().slice(0, 10)
}

// ── Supabase PostgREST / GoTrue Admin（service_role・supabase-js不要） ─────────
export function makeSupabaseHelpers(SB_URL, SB_KEY) {
  const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

  async function sbSelect(tableAndQuery) {
    const res = await fetch(`${SB_URL}/rest/v1/${tableAndQuery}`, { headers: SB_HEADERS })
    const text = await res.text()
    if (!res.ok) throw new Error(`SELECT ${tableAndQuery.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : []
  }

  // 404 PGRST205（テーブル未作成 = migration未適用）は「テーブル無し」として扱う。
  async function sbSelectOptional(tableAndQuery) {
    const res = await fetch(`${SB_URL}/rest/v1/${tableAndQuery}`, { headers: SB_HEADERS })
    if (res.status === 404) return { missing: true, rows: [] }
    const text = await res.text()
    if (!res.ok) throw new Error(`SELECT ${tableAndQuery.split('?')[0]} HTTP ${res.status}: ${text.slice(0, 300)}`)
    return { missing: false, rows: text ? JSON.parse(text) : [] }
  }

  async function sbInsert(table, rows, prefer = 'return=representation') {
    const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
      method: 'POST', headers: { ...SB_HEADERS, Prefer: prefer }, body: JSON.stringify(rows),
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null, raw: text }
  }

  async function sbUpdate(table, matchQuery, patch) {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${matchQuery}`, {
      method: 'PATCH', headers: { ...SB_HEADERS, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`UPDATE ${table} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  async function sbUpsert(table, row, onConflict) {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST', headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([row]),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`UPSERT ${table} HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  async function fetchAuthUser(userId) {
    const res = await fetch(`${SB_URL}/auth/v1/admin/users/${userId}`, { headers: SB_HEADERS })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`GoTrue admin HTTP ${res.status}`)
    return res.json()
  }

  return { sbSelect, sbSelectOptional, sbInsert, sbUpdate, sbUpsert, fetchAuthUser }
}

// ── マスク・サニタイズ ────────────────────────────────────────────────────────
export function maskEmail(email) {
  if (!email) return '(none)'
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  const head = local.slice(0, 1)
  return `${head}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`
}

export function sanitizeError(err) {
  const msg = String(err?.message ?? err ?? 'unknown error')
  return msg
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(re_|sk_|SUPABASE_|SERVICE_ROLE)[\w-]{6,}/g, '[redacted-key]')
    .slice(0, 500)
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// src/lib/social/attribution.ts buildTrackedUrl と同じロジック（.mjsからTSを直import出来ないため複製）。
export function buildTrackedUrl(url, code) {
  if (!url || !code) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}vp=${encodeURIComponent(code)}`
}

// ── unsubscribe token（HMAC-SHA256・改ざん検知・長期有効） ───────────────────────
// payload: { uid, t (notification_type|'all'), exp (unix seconds) }
// トークンは「配信停止用」であり、有効期限を短くすると古いメールから停止できなくなり
// スパム報告の方が増える（アンチパターン）ため長期有効とするが、署名付きURLを漏えい時に
// 無期限に近い期間有効にし続けるのも避けたい。半年程度（180日）を初期運用のバランス値とする
// （Phase 4.1でオーナー判断により400日→180日へ調整）。
// src/lib/notificationUnsubscribe.ts と同一アルゴリズム（NOTIFICATION_UNSUBSCRIBE_SECRETを共有）。
const DEFAULT_UNSUBSCRIBE_TTL_DAYS = 180

function base64url(input) {
  return Buffer.from(input).toString('base64url')
}

export function buildUnsubscribeToken(secret, userId, notificationType, ttlDays = DEFAULT_UNSUBSCRIBE_TTL_DAYS) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400
  const payload = base64url(JSON.stringify({ uid: userId, t: notificationType, exp }))
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function unsubscribeUrl(siteUrl, secret, userId, notificationType) {
  const token = buildUnsubscribeToken(secret, userId, notificationType)
  return `${siteUrl}/verity/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`
}

// ── 通知メールFrom既定値（Phase 4.2）───────────────────────────────────────────
// verity-official.comの独自subdomain(notify.verity-official.com)がResendでドメイン
// 認証済みになったため、Resendサンドボックス(onboarding@resend.dev)を既定から廃止する。
// NOTIFY_FROM_EMAIL環境変数が設定されている場合はそちらを優先する仕様は維持（変更なし）。
export const DEFAULT_NOTIFY_FROM_EMAIL = 'VERITY <notify@notify.verity-official.com>'

// ── production安全ガード（Step 6） ───────────────────────────────────────────
// sandboxドメイン(*.resend.dev)からのFromは「アカウント所有者宛にのみ送信可能」という
// Resend側の制約があるため、test-user以外への送信で使われることを構造的に禁止する。
export function assertProductionSafeFrom(fromAddr, isTestUserMode) {
  const isSandbox = /@resend\.dev$/i.test(fromAddr) || /<[^>]*@resend\.dev>/i.test(fromAddr)
  if (isSandbox && !isTestUserMode) {
    throw new Error(
      `production safety guard: From "${fromAddr}" is a Resend sandbox address and can only be used in --test-user mode. ` +
      'Set NOTIFY_FROM_EMAIL to a verified custom-domain address before sending beyond the test user.',
    )
  }
  return isSandbox
}

// ── Resend送信（raw fetch。List-Unsubscribeヘッダー対応） ─────────────────────
export async function sendViaResend({ apiKey, from, to, replyTo, subject, html, text, unsubscribeUrl: unsubUrl }) {
  const headers = {}
  if (unsubUrl) {
    headers['List-Unsubscribe'] = `<${unsubUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  const body = { from, to: [to], subject, html, text }
  if (replyTo) body.reply_to = replyTo
  if (Object.keys(headers).length > 0) body.headers = headers

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${raw.slice(0, 300)}`)
  return raw ? JSON.parse(raw) : {}
}

// ── 送信抑止（suppression）チェック（Step 16） ─────────────────────────────────
// notification_email_status（Phase 4 migration・未適用の間は「テーブル無し」として
// 何も抑止しない＝Phase 2/3の既存挙動を壊さない）。
export async function isSuppressed(helpers, userId) {
  const { missing, rows } = await helpers.sbSelectOptional(
    `notification_email_status?select=status&user_id=eq.${userId}`,
  )
  if (missing || rows.length === 0) return false
  return rows[0].status === 'bounced' || rows[0].status === 'complained' || rows[0].status === 'suppressed'
}
