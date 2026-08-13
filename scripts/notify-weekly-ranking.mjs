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
// 重要（引き続き有効な制約）:
//   ・本番全会員への自動送信はまだ行わない。--send は必ず --test-user とセットでのみ動作する。
//   ・cron登録はまだ行わない（本スクリプトは手動実行のみを想定）。
//   ・generate-weekly-rankings.mjs / weekly ranking DB schema / 集計ロジックには一切触れない。
//   ・test-userのnotify_weekly=falseを一時的に上書きして検証することはしない（実設定を尊重する）。
//
// 使い方: Phase 3から変更なし（--dry-run既定 / --week / --test-user=<uuid> / --send / --list-unnotified）
//
// env（新規）:
//   NOTIFY_REPLY_TO                   … 未設定なら reply_to を付けない
//   NOTIFICATION_UNSUBSCRIBE_SECRET   … --send 時必須（unsubscribe token署名用）
// ═════════════════════════════════════════════════════════════════════════════
import {
  loadAllEnv, jstIso, makeSupabaseHelpers, maskEmail, sanitizeError,
  escapeHtml, buildTrackedUrl, unsubscribeUrl, assertProductionSafeFrom, sendViaResend, isSuppressed,
  DEFAULT_NOTIFY_FROM_EMAIL,
} from './lib/notification-mailer.mjs'

const CWD = process.cwd()
const ARGV = process.argv.slice(2)
const SEND = ARGV.includes('--send')
const LIST_UNNOTIFIED = ARGV.includes('--list-unnotified')
const argVal = (name) => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const TEST_USER = argVal('test-user')

if (SEND && !TEST_USER) {
  console.error('FATAL --send には --test-user=<uuid> が必須です（Phase 3では全会員への一括送信は未実装）。')
  process.exit(2)
}

loadAllEnv(CWD)

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
for (const [k, v] of [['NEXT_PUBLIC_SUPABASE_URL', SB_URL], ['SUPABASE_SERVICE_ROLE_KEY', SB_KEY]]) {
  if (!v) { console.error(`FATAL notify-weekly-ranking missing env ${k}`); process.exit(2) }
}
const RESEND_API_KEY = process.env.RESEND_API_KEY
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
const FROM_ADDR = process.env.NOTIFY_FROM_EMAIL ?? DEFAULT_NOTIFY_FROM_EMAIL
const REPLY_TO = process.env.NOTIFY_REPLY_TO || undefined
const UNSUB_SECRET = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET

if (SEND && !RESEND_API_KEY) {
  console.error('FATAL --send には RESEND_API_KEY が必須です')
  process.exit(2)
}
if (SEND && !UNSUB_SECRET) {
  console.error('FATAL --send には NOTIFICATION_UNSUBSCRIBE_SECRET が必須です（List-Unsubscribeリンク署名用）')
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
  console.log(`\nSTART notify-weekly-ranking started_at=${jstIso()} mode=${SEND ? 'SEND' : 'DRY-RUN'}${TEST_USER ? ` test_user=${TEST_USER}` : ''}`)

  if (LIST_UNNOTIFIED) {
    await listUnnotifiedWeeks()
    console.log(`\nDONE (list-unnotified) finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return
  }

  if (TEST_USER) console.log('*** TEST MODE — 対象は指定ユーザー1名のみ ***')

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

  if (TEST_USER) {
    eligibleUserIds = eligibleUserIds.filter((uid) => uid === TEST_USER)
    if (eligibleUserIds.length === 0) {
      console.log(`\ntest-user ${TEST_USER} は notify_weekly=true ではありません、または配信抑止対象です（対象外）。マイページで設定してから再実行してください。`)
      printDone(t0, { users: 0, emails: 0 })
      return
    }
  }

  console.log(`生成予定メール件数: ${eligibleUserIds.length}通${TEST_USER ? '（test-user限定）' : '（dry-run。Phase 3では --test-user 無しの実送信は未実装）'}`)

  const previewUnsubUrl = TEST_USER && UNSUB_SECRET ? unsubscribeUrl(SITE_URL, UNSUB_SECRET, TEST_USER, NOTIFICATION_TYPE) : null
  const previewUnsubAllUrl = TEST_USER && UNSUB_SECRET ? unsubscribeUrl(SITE_URL, UNSUB_SECRET, TEST_USER, 'all') : null
  const email = buildEmail(top1, previewUnsubUrl, previewUnsubAllUrl)
  console.log('\n─── 生成メールプレビュー ───')
  console.log(`件名: ${email.subject}`)
  console.log('本文(text):\n' + email.text)

  if (!TEST_USER) {
    for (const uid of eligibleUserIds.slice(0, 20)) {
      const u = await fetchAuthUser(uid)
      console.log(`  user=${uid.slice(0, 8)}… email=${maskEmail(u?.email)}`)
    }
    if (eligibleUserIds.length > 20) console.log(`  …他${eligibleUserIds.length - 20}人`)
    printDone(t0, { users: eligibleUserIds.length, emails: 0 })
    return
  }

  // ── test-user経路 ───────────────────────────────────────────────────────────
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
  console.log(`\n*** TEST MODE: Resendへ実送信します — to=${maskEmail(email)} from=${FROM_ADDR} ***`)
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
    `\nDONE notify-weekly-ranking mode=${SEND ? 'SEND' : 'DRY-RUN'} ` +
    `users=${stats.users} emails_sent=${stats.emails} ` +
    `finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
}

main().catch((err) => {
  console.error('FATAL', sanitizeError(err))
  process.exit(1)
})
