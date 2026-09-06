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
export async function sendViaResend({ apiKey, from, to, replyTo, subject, html, text, unsubscribeUrl: unsubUrl, idempotencyKey }) {
  const emailHeaders = {}
  if (unsubUrl) {
    emailHeaders['List-Unsubscribe'] = `<${unsubUrl}>`
    emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  const body = { from, to: [to], subject, html, text }
  if (replyTo) body.reply_to = replyTo
  if (Object.keys(emailHeaders).length > 0) body.headers = emailHeaders

  // Idempotency-Key（HTTPリクエストヘッダー・Resend公式仕様）はbody.headers（メール自体の
  // カスタムヘッダー）とは別物。Resend側で24時間保持され、同一キー+同一payloadの再試行は
  // 元のレスポンスを返すのみで再送信しない。同一キー+異なるpayloadは409 invalid_idempotent_request
  // で拒否される（黙って重複送信されることはない）。未指定時は従来どおり付与しない。
  const requestHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${raw.slice(0, 300)}`)
  return raw ? JSON.parse(raw) : {}
}

// ── Resend冪等キー生成（Phase 3B-2・crash-window対策） ─────────────────────────
// deliveryId(notification_deliveries.id)はメール等PIIを含まない数値/UUIDのため、
// キーにPIIは混入しない。同一配信行への再送（stale-pending retry / failed retry）は
// deliveryIdが変わらないため常に同じキーになり、異なるユーザー/日付は必ず新しい行
// （新しいid）になるためキーも必ず異なる。
export function buildDeliveryIdempotencyKey(prefix, deliveryId) {
  if (!deliveryId) return undefined
  return `${prefix}-${deliveryId}`
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

// ═════════════════════════════════════════════════════════════════════════════
// Phase 5A — 全会員送信CLIの安全解禁準備
// ═════════════════════════════════════════════════════════════════════════════
// このセクションは「--send単独 / --production-send単独では絶対に全会員へ送信できない」
// という誤操作防止を、notify-actress-new-release.mjs と notify-weekly-ranking.mjs の
// 両方で完全に同一のルールとして強制するために存在する（スクリプトごとに微妙に異なる
// ガード実装になることを防ぐ）。Phase 5Aでは --production-send を実際に有効化する
// NOTIFICATION_RUNTIME=production はVPSへ未設定のため、本番送信は依然として実行不可能。
// ═════════════════════════════════════════════════════════════════════════════

// 誤設定で数千〜数万通飛ぶ事故を防ぐための既定上限（Step 11）。
export const DEFAULT_MAX_SEND = 100

// production-send時にSITE_URLが本当に公開ドメインを指しているかの照合先（Step 4-5）。
export const PRODUCTION_SITE_URL = 'https://verity-official.com'

// production-send実行を許可する唯一の環境（Step 3）。VPSの .env / ecosystem.config.js
// にのみ設定し、ローカルには意図的に設定しない運用とする。
export const PRODUCTION_RUNTIME_VALUE = 'production'

// ═════════════════════════════════════════════════════════════════════════════
// インシデント対応（Phase 5A再開時）: 2026-08-14、ガード検証テスト中に
// 「NOTIFICATION_RUNTIME=production をコマンド1回だけ付与」という単一条件の突破により、
// ローカルPCから実在の一般会員1名へ週間ランキングメールが実送信される事故が発生した。
// 原因は (1) production-send可否の判定が環境変数1個だけに依存していたこと、
// (2) ガード確認のテストに実際の --send 経路（本物のResend API呼び出しに到達し得るコード
// パス）を使ってしまったこと、の2点。
// 再発防止として:
//   ・production-send実行ガードを4条件の複合判定に強化（下記PRODUCTION_CWD等）。
//   ・「production-dry-run」を新設し、対象抽出・env検証・max-send検証は本番送信と
//     完全に同一ロジックを通しつつ、Resend呼び出し・DB書込みへ絶対に到達しない
//     コードパス（sendToTestUser/resendAndUpdateを一切呼ばない）として構造的に分離した。
//   ・ガード自体の動作確認（「拒否されること」の実証）は必ずこのproduction-dry-run、
//     または--send無しの経路で行う。実Resend APIに到達し得る--sendは、VPS上で
//     実際に送るとき以外に使わない。
// ═════════════════════════════════════════════════════════════════════════════

// production-send実行を許可する本番VPS上の実行パス（Step 2-B）。
export const PRODUCTION_CWD = '/home/veritysite/verity-official.com/app'

// production-send実行を許可するsentinelファイル（Step 2-C・3）。VPS専用に手動配置し、
// deploy.sh（app/配下をtar転送）の対象外パスに置くことで、deployでは絶対に生成されず、
// Gitにも一切含まれない（リポジトリ外パス）。中身に秘密情報は不要（存在有無のみ判定）。
export const PRODUCTION_SENTINEL_PATH = '/home/veritysite/verity-official.com/.notification-production'

// ── CLIフラグの組み合わせ解決（Step 2 / インシデント対応でproduction-dry-run追加） ──
// 曖昧な組み合わせは全てFATAL(exit 2)。
// 戻り値の mode は 'dry-run' | 'test-user' | 'production' | 'production-dry-run'。
// production-dry-run は --send を一切伴わない専用フラグとし、Resend呼び出しへ到達し得る
// コードパス（sendToTestUser/resendAndUpdate）を呼び出し元スクリプトが物理的に呼ばない
// 設計とセットで、production-sendのガード・対象抽出ロジックだけを安全に検証できる。
export function resolveSendMode(argv, scriptLabel) {
  const has = (name) => argv.includes(`--${name}`)
  const val = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : null
  }
  const send = has('send')
  const testUser = val('test-user')
  const productionSend = has('production-send')
  const confirmProductionSend = has('confirm-production-send')
  const productionDryRun = has('production-dry-run')
  const maxSendRaw = val('max-send')

  if (productionDryRun) {
    if (send || productionSend || confirmProductionSend) {
      console.error(`FATAL[${scriptLabel}] --production-dry-run は --send / --production-send / --confirm-production-send と併用できません（dry-runはRealSendパスと完全に分離するため）。`)
      process.exit(2)
    }
    const maxSend = maxSendRaw != null ? Number(maxSendRaw) : DEFAULT_MAX_SEND
    if (!Number.isFinite(maxSend) || !Number.isInteger(maxSend) || maxSend <= 0) {
      console.error(`FATAL[${scriptLabel}] --max-send は正の整数で指定してください（指定値: ${maxSendRaw}）。`)
      process.exit(2)
    }
    return { mode: 'production-dry-run', testUser: null, maxSend }
  }

  // --production-send 単独（--send を伴わない）は事故防止のため明示エラーにする。
  // dry-runへ黙って読み替えると「production-sendを付けたのに何も起きなかった」という
  // 誤解を生み、後で本当に送るときの見落としにつながるため。
  if (productionSend && !send) {
    console.error(`FATAL[${scriptLabel}] --production-send は --send と同時指定が必須です。`)
    process.exit(2)
  }
  if (!send) {
    return { mode: 'dry-run', testUser: testUser ?? null, maxSend: null }
  }
  if (testUser && productionSend) {
    console.error(`FATAL[${scriptLabel}] --test-user と --production-send は同時指定できません（曖昧な組み合わせのため拒否）。`)
    process.exit(2)
  }
  if (!testUser && !productionSend) {
    console.error(`FATAL[${scriptLabel}] --send には --test-user=<uuid> または --production-send のいずれかが必須です。`)
    process.exit(2)
  }
  if (productionSend) {
    if (!confirmProductionSend) {
      console.error(`FATAL[${scriptLabel}] --production-send には --confirm-production-send の明示指定が必須です（誤操作防止の二段階確認）。`)
      process.exit(2)
    }
    const maxSend = maxSendRaw != null ? Number(maxSendRaw) : DEFAULT_MAX_SEND
    if (!Number.isFinite(maxSend) || !Number.isInteger(maxSend) || maxSend <= 0) {
      console.error(`FATAL[${scriptLabel}] --max-send は正の整数で指定してください（指定値: ${maxSendRaw}）。`)
      process.exit(2)
    }
    return { mode: 'production', testUser: null, maxSend }
  }
  return { mode: 'test-user', testUser, maxSend: null }
}

// 対象件数がmax-sendを超過しているかどうかの純粋関数（I/O無し・単体テスト用。Step 6）。
export function exceedsMaxSend(candidateCount, maxSend) {
  return candidateCount > maxSend
}

// ── VPS専用実行ガード（Step 2）───────────────────────────────────────────────
// 2026-08-14のインシデント（環境変数1個だけの一致でproduction-sendが通ってしまった）を
// 受け、単一条件を廃止し4条件の複合判定にした。1つでも欠ければfail-closed。
// hostname単独判定は環境依存で偽装・変動しやすいため採用しない。
export function assertProductionRuntimeGuard(scriptLabel) {
  const problems = []
  if (process.env.NOTIFICATION_RUNTIME !== PRODUCTION_RUNTIME_VALUE) {
    problems.push(`NOTIFICATION_RUNTIME=${PRODUCTION_RUNTIME_VALUE} が未設定です`)
  }
  if (process.platform !== 'linux') {
    problems.push(`process.platform が linux ではありません（現在: ${process.platform}）`)
  }
  if (process.cwd() !== PRODUCTION_CWD) {
    problems.push(`実行cwdが本番VPS正規パス(${PRODUCTION_CWD})と一致しません`)
  }
  if (!fs.existsSync(PRODUCTION_SENTINEL_PATH)) {
    problems.push('production sentinelファイルが存在しません（VPS専用・Git管理外・deploy対象外）')
  }
  if (problems.length > 0) {
    throw new Error(
      `[${scriptLabel}] production-send実行環境の検証に失敗しました（4条件中${4 - problems.length}/4のみ合致）:\n` +
      ` - ${problems.join('\n - ')}`,
    )
  }
}

// ── production-send前の必須安全条件（Step 4） ───────────────────────────────────
// 1つでも欠落していれば例外を投げ、呼び出し元は「送信0通・DB書込み0」で終了する。
export async function assertProductionSendPreconditions({ scriptLabel, resendApiKey, fromAddr, unsubSecret, siteUrl, sbSelectOptional }) {
  const problems = []
  if (!resendApiKey) problems.push('RESEND_API_KEY が未設定です')
  if (!fromAddr) problems.push('NOTIFY_FROM_EMAIL が未設定です')
  if (fromAddr && (/@resend\.dev$/i.test(fromAddr) || /<[^>]*@resend\.dev>/i.test(fromAddr))) {
    problems.push('Fromがsandboxドメイン(*.resend.dev)のままです')
  }
  if (!unsubSecret) problems.push('NOTIFICATION_UNSUBSCRIBE_SECRET が未設定です')
  if (siteUrl !== PRODUCTION_SITE_URL) problems.push(`SITE_URLが本番URL(${PRODUCTION_SITE_URL})と一致しません`)

  for (const table of ['notification_email_status', 'notification_deliveries']) {
    try {
      const res = await sbSelectOptional(`${table}?select=user_id&limit=1`)
      if (res.missing) problems.push(`${table} テーブルに疎通できません（未作成の可能性）`)
    } catch (err) {
      problems.push(`${table} の疎通確認でエラー: ${sanitizeError(err)}`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`[${scriptLabel}] production-send 安全条件を満たしていません:\n - ${problems.join('\n - ')}`)
  }
}

// ── auth.users 状態の分類（Step 5-6: email_confirmed_at条件） ───────────────────
export function classifyAuthUser(authUser) {
  if (!authUser || authUser.deleted_at) return 'no_account'
  if (!authUser.email) return 'no_email'
  if (!authUser.email_confirmed_at) return 'unconfirmed'
  return 'ok'
}

// ── 限定並列実行（Step 16）。Resend APIへの同時大量リクエストを避ける。 ───────────
export const PRODUCTION_SEND_CONCURRENCY = 5

export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let idx = 0
  async function runOne() {
    while (idx < items.length) {
      const current = idx++
      results[current] = await worker(items[current], current)
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runOne)
  await Promise.all(workers)
  return results
}

// ── dry-run集計ヘルパー（Step 7-8）。全会員dry-runで実数を出すために使う。 ──────────
// GoTrue Admin APIはuser_idごとに個別呼び出しが必要（Admin一覧APIはメール検索に
// 向かないためこの構造を維持。会員規模が数千〜のオーダーになった場合は
// バッチ化/RPC化を再検討する。Phase 5Aでは実測件数を報告するに留め、DDLは追加しない）。
export async function classifyUsersForDryRun(userIds, fetchAuthUser, concurrency = PRODUCTION_SEND_CONCURRENCY) {
  const results = new Map()
  await runWithConcurrency(userIds, concurrency, async (uid) => {
    const authUser = await fetchAuthUser(uid)
    results.set(uid, { authUser, status: classifyAuthUser(authUser) })
  })
  return results
}

// notification_deliveries の既存状態（sent/pending/failed）をuser_idごとに取得する。
export async function lookupDeliveryStatuses(sbSelect, notificationType, groupKey, userIds) {
  const statusMap = new Map()
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100)
    const inList = chunk.map((v) => `"${v}"`).join(',')
    const rows = await sbSelect(
      `notification_deliveries?select=user_id,status,created_at&notification_type=eq.${notificationType}` +
      `&group_key=eq.${encodeURIComponent(groupKey)}&user_id=in.(${encodeURIComponent(inList)})`,
    )
    for (const r of rows) statusMap.set(r.user_id, r)
  }
  return statusMap
}
