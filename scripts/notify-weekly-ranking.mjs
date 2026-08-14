#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// notify-weekly-ranking.mjs — VERITY週間ランキング更新メール通知（Phase 3 / Phase 4更新）
// ═════════════════════════════════════════════════════════════════════════════
// 「週間ランキング生成済みデータ検出 → notify_weekly=trueのユーザー抽出 →
//  week_key単位で冪等化 → Resend用メール生成」までの実装。
//
// Phase 4での変更点:
//   ・env読込/PostgREST/GoTrue/mask/sanitize/Resend送信/unsubscribe token を
//     scripts/lib/notification-mailer.mjs（共通モジュール。notify-actress-new-release.mjs
//     と共有）へ集約。
//   ・List-Unsubscribe / List-Unsubscribe-Post ヘッダーを送信メールへ付与。
//   ・本文footerに「この通知を停止する」（token付きワンクリックリンク）を追加。
//   ・notification_email_status（bounce/complained/suppressed）を送信前に確認し、
//     該当ユーザーを対象から除外（テーブル未適用の間は何も抑止しない＝既存挙動維持）。
//   ・production安全ガード: Fromがsandbox(*.resend.dev)のままtest-user以外に
//     送ろうとした場合は例外を投げて停止する。
//
// Phase 5Aでの変更点（全会員送信CLIの安全解禁準備。まだ実送信はできない）:
//   ・--production-send + --confirm-production-send + --max-send=<n> による
//     全会員送信モードを追加。--send / --test-user 単独では従来どおり全会員へは送れない。
//   ・production-sendは NOTIFICATION_RUNTIME=production （VPS専用・未設定ならFATAL）
//     が無いと実行できない。ローカルには意図的に設定しない。
//   ・全会員dry-run（--test-user無し）でemail_confirmed_at未確認/抑止/sent済み内訳を実データで表示。
//   ・週間ランキングはweek_keyで冪等なため notification_job_state は使わない（Step 14）。
//
// 重要（引き続き有効な制約）:
//   ・cron登録はまだ行わない（本スクリプトは手動実行のみを想定）。
//   ・generate-weekly-rankings.mjs / weekly ranking DB schema / 集計ロジックには一切触れない。
//   ・test-userのnotify_weekly=falseを一時的に上書きして検証することはしない（実設定を尊重する）。
//   ・test-userモードのロジック（sendToTestUser/resendAndUpdate）はPhase 3から変更しない。
//
// 使い方:
//   dry-run（全会員・実データ集計）: node notify-weekly-ranking.mjs --dry-run
//   dry-run（単一ユーザープレビュー）: node notify-weekly-ranking.mjs --dry-run --test-user=<uuid>
//   test-user実送信: node notify-weekly-ranking.mjs --send --test-user=<uuid>
//   全会員本番送信（Phase 5B以降・VPS専用）:
//     node notify-weekly-ranking.mjs --send --production-send --confirm-production-send [--max-send=<n>]
//
// env:
//   NOTIFY_REPLY_TO                   … 未設定なら reply_to を付けない
//   NOTIFICATION_UNSUBSCRIBE_SECRET   … --send 時必須（unsubscribe token署名用）
//   NOTIFICATION_RUNTIME              … production-send時は "production" が必須（VPS専用ガード）
// ═════════════════════════════════════════════════════════════════════════════
import {
  loadAllEnv, jstIso, makeSupabaseHelpers, maskEmail, sanitizeError,
  escapeHtml, buildTrackedUrl, unsubscribeUrl, assertProductionSafeFrom, sendViaResend, isSuppressed,
  DEFAULT_NOTIFY_FROM_EMAIL, resolveSendMode, assertProductionRuntimeGuard, assertProductionSendPreconditions,
  classifyUsersForDryRun, lookupDeliveryStatuses, runWithConcurrency, PRODUCTION_SEND_CONCURRENCY, exceedsMaxSend,
} from './lib/notification-mailer.mjs'

const SCRIPT_LABEL = 'notify-weekly'
const CWD = process.cwd()
const ARGV = process.argv.slice(2)
const LIST_UNNOTIFIED = ARGV.includes('--list-unnotified')
const argVal = (name) => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const SEND_MODE = LIST_UNNOTIFIED ? { mode: 'list-unnotified', testUser: null, maxSend: null } : resolveSendMode(ARGV, SCRIPT_LABEL)
const MODE = SEND_MODE.mode // 'dry-run' | 'test-user' | 'production' | 'production-dry-run' | 'list-unnotified'
// SEND: RESEND_API_KEY/UNSUB_SECRETの存在を必須とするモードか（production-dry-runもenv
// 検証の一環として必須。実際にResendへ到達し得るのは 'test-user' と 'production' のみ）。
const SEND = MODE === 'test-user' || MODE === 'production' || MODE === 'production-dry-run'
const TEST_USER = SEND_MODE.testUser
const MAX_SEND = SEND_MODE.maxSend

loadAllEnv(CWD)

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
for (const [k, v] of [['NEXT_PUBLIC_SUPABASE_URL', SB_URL], ['SUPABASE_SERVICE_ROLE_KEY', SB_KEY]]) {
  if (!v) { console.error(`FATAL[${SCRIPT_LABEL}] missing env ${k}`); process.exit(2) }
}
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
const FROM_ADDR = process.env.NOTIFY_FROM_EMAIL ?? DEFAULT_NOTIFY_FROM_EMAIL
const REPLY_TO = process.env.NOTIFY_REPLY_TO || undefined
const UNSUB_SECRET = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET

if (SEND && !RESEND_API_KEY) {
  console.error(`FATAL[${SCRIPT_LABEL}] --send には RESEND_API_KEY が必須です`)
  process.exit(2)
}
if (SEND && !UNSUB_SECRET) {
  console.error(`FATAL[${SCRIPT_LABEL}] --send には NOTIFICATION_UNSUBSCRIBE_SECRET が必須です（List-Unsubscribeリンク署名用）`)
  process.exit(2)
}

const { sbSelect, sbSelectOptional, sbInsert, sbUpdate, fetchAuthUser } = makeSupabaseHelpers(SB_URL, SB_KEY)

const NOTIFICATION_TYPE = 'weekly_ranking'
const STALE_PENDING_MINUTES = 30
const RANKING_TYPES = ['actress', 'work', 'maker', 'newcomer', 'rising']
const RANKING_LABEL = { actress: '女優ランキング', work: '作品ランキング', maker: 'メーカーランキング', newcomer: '新人ランキング', rising: '急上昇ランキング' }
// readVp()（src/lib/analytics.ts）は ?vp= を16文字にslice するため、この範囲に収める。
const VP_CODE = 'email_weekly'

// ── 対象週の解決 ─────────────────────────────────────────────────────────────
async function resolveTargetWeek(explicitWeek) {
  const nowIso = new Date().toISOString()
  let candidateKeys
  if (explicitWeek) {
    candidateKeys = [explicitWeek]
  } else {
    const rows = await sbSelect(`weekly_rankings?select=week_key&published_at=lte.${encodeURIComponent(nowIso)}&order=week_key.desc&limit=50`)
    candidateKeys = [...new Set(rows.map((r) => r.week_key))]
  }

  for (const weekKey of candidateKeys) {
    const rows = await sbSelect(`weekly_rankings?select=ranking_type,rank,entity_id,entity_name,published_at&week_key=eq.${weekKey}&published_at=lte.${encodeURIComponent(nowIso)}&order=ranking_type.asc,rank.asc`)
    if (rows.length === 0) continue
    const types = new Set(rows.map((r) => r.ranking_type))
    const complete = RANKING_TYPES.every((t) => types.has(t))
    if (!complete) {
      console.log(`week_key=${weekKey}: 5カテゴリ不完全（${[...types].join(',')}）— スキップ`)
      continue
    }
    const publishedAt = rows[0].published_at
    return { weekKey, publishedAt, rows }
  }
  return null
}

function top1Map(rows) {
  const out = {}
  for (const type of RANKING_TYPES) {
    const r = rows.filter((x) => x.ranking_type === type).sort((a, b) => a.rank - b.rank)[0]
    if (r) out[type] = r
  }
  return out
}

// ── メール本文生成（全ユーザー共通・パーソナライズなし） ────────────────────────
// unsubUrl: 週間ランキング通知だけを止める人間向けリンク（List-Unsubscribeヘッダーも同じ種別）。
// unsubAllUrl: VERITYの全メール通知を停止する人間向けリンク（本文内リンクのみ・One-Clickの対象にはしない）。
function buildEmail(top1, unsubUrl, unsubAllUrl) {
  const subject = '【VERITY WEEKLY】今週の人気ランキングを公開しました'
  const rankingUrl = buildTrackedUrl(`${SITE_URL}/verity/rankings/weekly`, VP_CODE)
  const profileUrl = `${SITE_URL}/verity/profile`

  const textLines = [
    'VERITY週間ランキングを更新しました。',
    '今週もっとも注目を集めた女優・作品・メーカーはこちら。',
    '',
  ]
  const htmlItems = []
  for (const type of RANKING_TYPES) {
    const r = top1[type]
    if (!r) continue
    const label = r.entity_name
    textLines.push(`■ ${RANKING_LABEL[type]}`, `1位：${label}`, '')
    htmlItems.push(`
      <div style="margin-bottom:14px">
        <div style="font-size:13px;font-weight:bold;color:#E20074">■ ${RANKING_LABEL[type]}</div>
        <div style="font-size:14px">1位：${escapeHtml(label)}</div>
      </div>`)
  }
  textLines.push(
    '今週のランキングをすべて見る',
    `→ ${rankingUrl}`,
    '',
    '通知設定はマイページからいつでも変更できます。',
    `通知設定を変更する: ${profileUrl}`,
  )
  if (unsubUrl) textLines.push(`週間ランキング通知を停止する: ${unsubUrl}`)
  if (unsubAllUrl) textLines.push(`すべてのメール通知を停止する: ${unsubAllUrl}`)

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
      <h2 style="color:#E20074;border-bottom:2px solid #E20074;padding-bottom:8px">VERITY WEEKLY</h2>
      <p>VERITY週間ランキングを更新しました。<br/>今週もっとも注目を集めた女優・作品・メーカーはこちら。</p>
      ${htmlItems.join('')}
      <p><a href="${rankingUrl}" style="color:#E20074;font-weight:bold">今週のランキングをすべて見る →</a></p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
      <p style="font-size:12px;color:#999">
        通知設定はマイページからいつでも変更できます。<br/>
        <a href="${profileUrl}" style="color:#999">通知設定を変更する</a>
        ${unsubUrl ? ` ／ <a href="${unsubUrl}" style="color:#999">週間ランキング通知を停止する</a>` : ''}
        ${unsubAllUrl ? ` ／ <a href="${unsubAllUrl}" style="color:#999">すべてのメール通知を停止する</a>` : ''}
      </p>
    </div>`

  return { subject, text: textLines.join('\n'), html }
}

function buildAuditPayload(weekKey, publishedAt, top1) {
  const rankings = {}
  for (const type of RANKING_TYPES) {
    const r = top1[type]
    if (!r) continue
    rankings[type] = type === 'work'
      ? { entity_id: r.entity_id, title: r.entity_name }
      : { entity_id: r.entity_id, name: r.entity_name }
  }
  return { week_key: weekKey, published_at: publishedAt, rankings }
}

// ── 未通知週レポート（読み取り専用。送信なし） ────────────────────────────────
async function listUnnotifiedWeeks() {
  const nowIso = new Date().toISOString()
  const rows = await sbSelect(`weekly_rankings?select=week_key,ranking_type,published_at&published_at=lte.${encodeURIComponent(nowIso)}&order=week_key.desc`)
  const byWeek = new Map()
  for (const r of rows) {
    if (!byWeek.has(r.week_key)) byWeek.set(r.week_key, { types: new Set(), publishedAt: r.published_at })
    byWeek.get(r.week_key).types.add(r.ranking_type)
  }
  const completeWeeks = [...byWeek.entries()]
    .filter(([, v]) => RANKING_TYPES.every((t) => v.types.has(t)))
    .map(([weekKey, v]) => ({ weekKey, publishedAt: v.publishedAt }))

  const eligibleSettings = await sbSelect(`favorite_notification_settings?select=user_id&notify_weekly=eq.true`)
  const eligibleCount = eligibleSettings.length

  console.log(`\n公開済み・5カテゴリ完全な週: ${completeWeeks.length}件 / notify_weekly=true ユーザー: ${eligibleCount}人\n`)
  for (const w of completeWeeks) {
    const sentRows = await sbSelect(`notification_deliveries?select=user_id&notification_type=eq.${NOTIFICATION_TYPE}&group_key=eq.${w.weekKey}&status=eq.sent`)
    const backlog = eligibleCount > 0 && sentRows.length === 0
    console.log(`week_key=${w.weekKey} published_at=${w.publishedAt} sent=${sentRows.length}/${eligibleCount} ${backlog ? '*** BACKLOG(未通知) ***' : ''}`)
  }
}

// ── メイン ───────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  console.log(`\nSTART notify-weekly-ranking started_at=${jstIso()} mode=${MODE.toUpperCase()}${TEST_USER ? ` test_user=${TEST_USER}` : ''}${MAX_SEND ? ` max_send=${MAX_SEND}` : ''}`)

  if (LIST_UNNOTIFIED) {
    await listUnnotifiedWeeks()
    console.log(`\nDONE (list-unnotified) finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return
  }

  if (TEST_USER) console.log('*** TEST MODE — 対象は指定ユーザー1名のみ ***')
  if (MODE === 'production' || MODE === 'production-dry-run') {
    console.log(MODE === 'production'
      ? '*** PRODUCTION SEND MODE — 全会員が対象です（安全ガード通過後のみ送信） ***'
      : '*** PRODUCTION DRY-RUN — 対象抽出・env検証・max-send検証のみ。Resend呼び出し・DB書込みは一切行いません ***')
    // production-dry-runもVPS専用ガードを通す。ただしこのモードはsendToTestUser/
    // resendAndUpdateを一度も呼ばない構造のため、ガードにバグがあっても実送信には到達し得ない。
    assertProductionRuntimeGuard(SCRIPT_LABEL)
    await assertProductionSendPreconditions({
      scriptLabel: SCRIPT_LABEL, resendApiKey: RESEND_API_KEY, fromAddr: FROM_ADDR,
      unsubSecret: UNSUB_SECRET, siteUrl: SITE_URL, sbSelectOptional,
    })
    console.log('production安全条件チェック: OK')
  }

  const target = await resolveTargetWeek(argVal('week'))
  if (!target) {
    console.log('公開済み・5カテゴリ完全な週が見つかりません — 終了')
    printDone(t0, { users: 0, emails: 0 })
    return
  }
  console.log(`\n対象週: week_key=${target.weekKey} published_at=${target.publishedAt}`)

  const top1 = top1Map(target.rows)
  console.log('\n─── 5カテゴリ成立確認（1位） ───')
  for (const type of RANKING_TYPES) {
    const r = top1[type]
    console.log(`  ${RANKING_LABEL[type]}: ${r ? `#1 ${r.entity_name} (entity_id=${r.entity_id})` : '*** 欠損 ***'}`)
  }
  if (RANKING_TYPES.some((t) => !top1[t])) {
    console.log('\n5カテゴリの一部が欠損しているため通知を中止します。')
    printDone(t0, { users: 0, emails: 0 })
    return
  }

  // ── notify_weekly=true のユーザー抽出。設定行なし＝false（Phase 1 UI仕様と完全一致）。──
  const settingsRows = await sbSelect(`favorite_notification_settings?select=user_id&notify_weekly=eq.true`)
  let eligibleUserIds = settingsRows.map((r) => r.user_id)

  // ── bounce/complaint抑止（notification_email_status。Phase 4新規・未適用なら何も抑止しない） ──
  const suppressedIds = new Set()
  for (const uid of eligibleUserIds) {
    if (await isSuppressed({ sbSelectOptional }, uid)) suppressedIds.add(uid)
  }
  if (suppressedIds.size > 0) eligibleUserIds = eligibleUserIds.filter((uid) => !suppressedIds.has(uid))
  console.log(`\nnotify_weekly=true ユーザー: ${eligibleUserIds.length}人（bounce/complaint抑止${suppressedIds.size}人除外済み）`)

  // ── production-send / production-dry-run: 送信開始前にmax-send上限チェック（Step 11）──
  if ((MODE === 'production' || MODE === 'production-dry-run') && exceedsMaxSend(eligibleUserIds.length, MAX_SEND)) {
    throw new Error(
      `[${SCRIPT_LABEL}] 対象ユーザー数(${eligibleUserIds.length})が --max-send=${MAX_SEND} を超過しました。` +
      '安全のため送信を中止します（0通・全件送るか0件かのみ許可）。',
    )
  }

  if (TEST_USER) {
    eligibleUserIds = eligibleUserIds.filter((uid) => uid === TEST_USER)
    if (eligibleUserIds.length === 0) {
      console.log(`\ntest-user ${TEST_USER} は notify_weekly=true ではありません、または配信抑止対象です（対象外）。マイページで設定してから再実行してください。`)
      printDone(t0, { users: 0, emails: 0 })
      return
    }
  }

  const modeLabel = TEST_USER ? '（test-user限定）' : MODE === 'production' ? '（production-send）' : MODE === 'production-dry-run' ? '（production-dry-run）' : '（dry-run）'
  console.log(`生成予定メール件数: ${eligibleUserIds.length}通${modeLabel}`)

  const previewUnsubUrl = TEST_USER && UNSUB_SECRET ? unsubscribeUrl(SITE_URL, UNSUB_SECRET, TEST_USER, NOTIFICATION_TYPE) : null
  const previewUnsubAllUrl = TEST_USER && UNSUB_SECRET ? unsubscribeUrl(SITE_URL, UNSUB_SECRET, TEST_USER, 'all') : null
  const email = buildEmail(top1, previewUnsubUrl, previewUnsubAllUrl)
  console.log('\n─── 生成メールプレビュー ───')
  console.log(`件名: ${email.subject}`)
  console.log('本文(text):\n' + email.text)

  // ── production-send モード（Phase 5A新規。NOTIFICATION_RUNTIME未設定のため未到達） ──
  if (MODE === 'production') {
    console.log(`\n*** PRODUCTION SEND — 対象${eligibleUserIds.length}人へ送信します（max-send=${MAX_SEND}） ***`)
    const payload = buildAuditPayload(target.weekKey, target.publishedAt, top1)
    const summary = await runProductionSend(eligibleUserIds, top1, payload, target.weekKey)
    printSendSummary(summary, t0)
    if (summary.failed > 0) {
      console.log(`\n${summary.failed}件の失敗がありました（週間ランキングはweek_key冪等のためwatermark概念は無し。次回実行時にfailed分をretryします）。`)
      process.exitCode = 1
    }
    printDone(t0, { users: eligibleUserIds.length, emails: summary.sent })
    return
  }

  // ── production-dry-run（インシデント対応で新設）。runProductionSend/sendToTestUser/
  //    resendAndUpdateのいずれも呼ばない＝Resend呼び出しコード自体がこの分岐に存在しない。
  //    対象抽出・env検証・max-send検証はproduction-sendと完全同一ロジックを共有。 ─────────
  if (MODE === 'production-dry-run') {
    console.log(`\n*** PRODUCTION DRY-RUN 結果 — max-send=${MAX_SEND}以内、対象${eligibleUserIds.length}人（実送信0・DB書込み0） ***`)
    if (eligibleUserIds.length === 0) {
      console.log('対象ユーザー0人')
    } else {
      const authMap = await classifyUsersForDryRun(eligibleUserIds, fetchAuthUser)
      const deliveryMap = await lookupDeliveryStatuses(sbSelect, NOTIFICATION_TYPE, target.weekKey, eligibleUserIds)
      printFullDryRunReport(eligibleUserIds, authMap, deliveryMap)
    }
    printDone(t0, { users: eligibleUserIds.length, emails: 0 })
    return
  }

  // ── dry-run（全会員・実データ集計。Phase 5A新規強化） ───────────────────────────
  if (!TEST_USER) {
    console.log('\n─── 全会員dry-run 集計 ───')
    if (eligibleUserIds.length === 0) {
      console.log('対象ユーザー0人')
    } else {
      const authMap = await classifyUsersForDryRun(eligibleUserIds, fetchAuthUser)
      const deliveryMap = await lookupDeliveryStatuses(sbSelect, NOTIFICATION_TYPE, target.weekKey, eligibleUserIds)
      printFullDryRunReport(eligibleUserIds, authMap, deliveryMap)
    }
    printDone(t0, { users: eligibleUserIds.length, emails: 0 })
    return
  }

  // ── test-user経路（Phase 3から変更なし） ────────────────────────────────────
  const authUser = await fetchAuthUser(TEST_USER)
  if (!authUser || authUser.deleted_at) {
    console.log(`\ntest-user ${TEST_USER} の有効な auth.users 行が見つかりません（退会済みの可能性）。送信しません。`)
    printDone(t0, { users: 1, emails: 0 })
    return
  }
  console.log(`宛先: ${maskEmail(authUser.email)}`)

  if (!SEND) {
    console.log('\n(dry-run のため実送信・DB書込みは行っていません。--send を追加すると実送信されます)')
    printDone(t0, { users: 1, emails: 0 })
    return
  }

  assertProductionSafeFrom(FROM_ADDR, true) // true = test-user mode
  const payload = buildAuditPayload(target.weekKey, target.publishedAt, top1)
  const wasSent = await sendToTestUser(TEST_USER, authUser.email, email, payload, target.weekKey)
  printDone(t0, { users: 1, emails: wasSent ? 1 : 0 })
}

// ── 全会員dry-run集計・表示（Step 8 / Step 10） ─────────────────────────────────
function printFullDryRunReport(userIds, authMap, deliveryMap) {
  let noEmail = 0, unconfirmed = 0, noAccount = 0, sentAlready = 0, pendingRecent = 0, retryCount = 0, newCount = 0
  const rows = []
  for (const uid of userIds) {
    const info = authMap.get(uid)
    const delivery = deliveryMap.get(uid)
    let reason
    if (info.status === 'no_account') { noAccount++; reason = 'no_account' }
    else if (info.status === 'no_email') { noEmail++; reason = 'no_email' }
    else if (info.status === 'unconfirmed') { unconfirmed++; reason = 'unconfirmed' }
    else if (delivery?.status === 'sent') { sentAlready++; reason = 'already_sent' }
    else if (delivery?.status === 'pending') {
      const ageMin = (Date.now() - new Date(delivery.created_at).getTime()) / 60000
      if (ageMin < STALE_PENDING_MINUTES) { pendingRecent++; reason = 'pending_recent' }
      else { retryCount++; newCount++; reason = 'stale_pending_retry' }
    } else if (delivery?.status === 'failed') { retryCount++; newCount++; reason = 'failed_retry' }
    else { newCount++; reason = 'new' }
    rows.push({ uid, email: info.authUser?.email, reason })
  }

  console.log(`対象ユーザー数(候補): ${userIds.length}`)
  console.log(`  生成予定メール数: ${newCount}（うちfailed/stale-pending retry候補: ${retryCount}）`)
  console.log(`  既にsent済み(スキップ): ${sentAlready}`)
  console.log(`  pending処理中・直近${STALE_PENDING_MINUTES}分以内(スキップ): ${pendingRecent}`)
  console.log(`  emailなし(スキップ): ${noEmail}`)
  console.log(`  email未確認(スキップ): ${unconfirmed}`)
  console.log(`  authアカウントなし(スキップ): ${noAccount}`)

  console.log('\n─── 対象ユーザー内訳（先頭20件、メールはマスク） ───')
  for (const r of rows.slice(0, 20)) {
    console.log(`  user=${r.uid.slice(0, 8)}… email=${maskEmail(r.email)} reason=${r.reason}`)
  }
  if (rows.length > 20) console.log(`  …他${rows.length - 20}人`)
}

// ── production-send 実行本体（Step 15-18）。sendToTestUser/resendAndUpdateは変更せず再利用。──
async function runProductionSend(userIds, top1, payload, groupKey) {
  const summary = {
    total_candidates: userIds.length, sent: 0, skipped_sent: 0, skipped_pending_recent: 0,
    skipped_no_email: 0, skipped_unconfirmed: 0, skipped_no_account: 0, failed: 0, pending_retried: 0,
  }
  await runWithConcurrency(userIds, PRODUCTION_SEND_CONCURRENCY, async (uid) => {
    const authUser = await fetchAuthUser(uid)
    const cls = authUser && !authUser.deleted_at
      ? (!authUser.email ? 'no_email' : (!authUser.email_confirmed_at ? 'unconfirmed' : 'ok'))
      : 'no_account'
    if (cls === 'no_account') { summary.skipped_no_account++; return }
    if (cls === 'no_email') { summary.skipped_no_email++; return }
    if (cls === 'unconfirmed') { summary.skipped_unconfirmed++; return }

    // 週間ランキングは全ユーザー共通本文だが、footerのunsubscribe tokenだけ本人用のHMAC署名で
    // 差し替える必要があるため、共有buildEmail()を本人のuserIdで都度呼び直す。
    const unsubUrlForUser = unsubscribeUrl(SITE_URL, UNSUB_SECRET, uid, NOTIFICATION_TYPE)
    const unsubAllUrlForUser = unsubscribeUrl(SITE_URL, UNSUB_SECRET, uid, 'all')
    const finalEmail = buildEmail(top1, unsubUrlForUser, unsubAllUrlForUser)

    const matchQuery = `user_id=eq.${uid}&notification_type=eq.${NOTIFICATION_TYPE}&group_key=eq.${groupKey}`
    const existing = await sbSelect(`notification_deliveries?select=id,status,created_at&${matchQuery}`)

    if (existing.length > 0) {
      const row = existing[0]
      if (row.status === 'sent') { summary.skipped_sent++; return }
      if (row.status === 'pending') {
        const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60000
        if (ageMin < STALE_PENDING_MINUTES) { summary.skipped_pending_recent++; return }
        summary.pending_retried++
      }
      const ok = await resendAndUpdate(row.id, uid, authUser.email, finalEmail)
      if (ok) summary.sent++; else summary.failed++
      return
    }

    const ins = await sbInsert('notification_deliveries', [{
      user_id: uid, notification_type: NOTIFICATION_TYPE, group_key: groupKey,
      entity_type: 'weekly_digest', payload, status: 'pending',
    }])
    if (!ins.ok) {
      if (ins.status === 409) { summary.skipped_pending_recent++; return }
      console.error(`INSERT失敗 user=${uid.slice(0, 8)}… HTTP ${ins.status}`)
      summary.failed++
      return
    }
    const id = ins.body?.[0]?.id
    const ok = await resendAndUpdate(id, uid, authUser.email, finalEmail)
    if (ok) summary.sent++; else summary.failed++
  })
  return summary
}

function printSendSummary(summary, t0) {
  console.log('\n─── send summary ───')
  console.log(`total_candidates=${summary.total_candidates} sent=${summary.sent} skipped_sent=${summary.skipped_sent} ` +
    `skipped_pending_recent=${summary.skipped_pending_recent} skipped_no_email=${summary.skipped_no_email} ` +
    `skipped_unconfirmed=${summary.skipped_unconfirmed} skipped_no_account=${summary.skipped_no_account} ` +
    `failed=${summary.failed} pending_retried=${summary.pending_retried} duration=${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

// ── test-user 実送信（冪等性・状態遷移込み。Phase 2と同じ状態遷移設計） ────────────
async function sendToTestUser(userId, email, emailContent, payload, groupKey) {
  const matchQuery = `user_id=eq.${userId}&notification_type=eq.${NOTIFICATION_TYPE}&group_key=eq.${groupKey}`
  const existing = await sbSelect(`notification_deliveries?select=id,status,created_at&${matchQuery}`)

  if (existing.length > 0) {
    const row = existing[0]
    if (row.status === 'sent') {
      console.log(`\n既にこの週は送信済み(status=sent, id=${row.id})のため再送しません。`)
      return false
    }
    if (row.status === 'pending') {
      const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60000
      if (ageMin < STALE_PENDING_MINUTES) {
        console.log(`\n既に処理中の可能性があります(status=pending, ${ageMin.toFixed(1)}分前作成)。${STALE_PENDING_MINUTES}分以内は二重送信防止のためスキップします。`)
        return false
      }
      console.log(`\nstale pending検出(${ageMin.toFixed(1)}分前)。クラッシュ復旧として再試行します。`)
    } else {
      console.log(`\n既存status=${row.status}の行を再試行します。`)
    }
    return await resendAndUpdate(row.id, userId, email, emailContent)
  }

  const ins = await sbInsert('notification_deliveries', [{
    user_id: userId, notification_type: NOTIFICATION_TYPE, group_key: groupKey,
    entity_type: 'weekly_digest', payload, status: 'pending',
  }])
  if (!ins.ok) {
    if (ins.status === 409) {
      console.log('\nINSERT pendingが競合(409)しました。別プロセスが同時に処理中の可能性があるため送信しません。')
      return false
    }
    throw new Error(`INSERT notification_deliveries failed: HTTP ${ins.status} ${ins.raw?.slice(0, 200)}`)
  }
  const id = ins.body?.[0]?.id
  return await resendAndUpdate(id, userId, email, emailContent)
}

async function resendAndUpdate(deliveryId, userId, email, emailContent) {
  console.log(`\n*** [${MODE.toUpperCase()}] Resendへ実送信します — to=${maskEmail(email)} from=${FROM_ADDR} ***`)
  try {
    const unsubUrl = unsubscribeUrl(SITE_URL, UNSUB_SECRET, userId, NOTIFICATION_TYPE)
    const json = await sendViaResend({
      apiKey: RESEND_API_KEY, from: FROM_ADDR, to: email, replyTo: REPLY_TO,
      subject: emailContent.subject, html: emailContent.html, text: emailContent.text,
      unsubscribeUrl: unsubUrl,
    })
    if (deliveryId) {
      await sbUpdate('notification_deliveries', `id=eq.${deliveryId}`, { status: 'sent', sent_at: new Date().toISOString() })
    }
    console.log(`送信成功 — resend_id=${json.id ?? '(unknown)'} delivery_id=${deliveryId}`)
    return true
  } catch (err) {
    console.error('送信失敗:', sanitizeError(err))
    if (deliveryId) {
      await sbUpdate('notification_deliveries', `id=eq.${deliveryId}`, { status: 'failed', error: sanitizeError(err) })
    }
    return false
  }
}

function printDone(t0, stats) {
  console.log(
    `\nDONE notify-weekly-ranking mode=${MODE.toUpperCase()} ` +
    `users=${stats.users} emails_sent=${stats.emails} ` +
    `finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
}

main().catch((err) => {
  console.error('FATAL', sanitizeError(err))
  process.exit(1)
})
