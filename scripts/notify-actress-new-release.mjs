#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// notify-actress-new-release.mjs — お気に入り女優 新作メール通知（Phase 2 / Phase 4更新）
// ═════════════════════════════════════════════════════════════════════════════
// 「新規videoa作品を検出 → お気に入り女優とIDで照合 → ユーザーごとに1日1通へ集約
//  → notification_deliveriesで冪等化 → Resend用メール生成」までの実装。
//
// Phase 4での変更点:
//   ・env読込/PostgREST/GoTrue/mask/sanitize/Resend送信/unsubscribe token を
//     scripts/lib/notification-mailer.mjs（共通モジュール）へ集約。
//   ・List-Unsubscribe / List-Unsubscribe-Post ヘッダーを送信メールへ付与。
//   ・本文footerに「この通知を停止する」（token付きワンクリックリンク）を追加
//     （「通知設定を変更する」→/verity/profile とは役割を分離）。
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
//   ・全会員dry-run（--test-user無し）で対象人数・抑止内訳・生成予定メール数を実データで表示。
//   ・email_confirmed_at未確認ユーザーをproduction-send対象から除外。
//   ・notification_job_stateのwatermarkは production-send が失敗0件で完了した場合のみ前進。
//
// 重要（引き続き有効な制約）:
//   ・cron登録はまだ行わない（本スクリプトは手動実行のみを想定）。
//   ・maker-sync / weekly ranking / 既存お気に入り機能には一切触れない（読み取りのみ）。
//   ・test-userモードのロジック（sendToTestUser/resendAndUpdate）はPhase 2から変更しない。
//
// 使い方:
//   dry-run（全会員・実データ集計）: node notify-actress-new-release.mjs --dry-run
//   dry-run（単一ユーザープレビュー）: node notify-actress-new-release.mjs --dry-run --test-user=<uuid>
//   test-user実送信: node notify-actress-new-release.mjs --send --test-user=<uuid>
//   全会員本番送信（Phase 5B以降・VPS専用）:
//     node notify-actress-new-release.mjs --send --production-send --confirm-production-send [--max-send=<n>]
//
// env:
//   NOTIFY_REPLY_TO                   … 未設定なら reply_to を付けない
//   NOTIFICATION_UNSUBSCRIBE_SECRET   … --send 時必須（unsubscribe token署名用）
//   NOTIFICATION_RUNTIME              … production-send時は "production" が必須（VPS専用ガード）
// ═════════════════════════════════════════════════════════════════════════════
import {
  loadAllEnv, jstIso, jstDateKey, makeSupabaseHelpers, maskEmail, sanitizeError,
  escapeHtml, buildTrackedUrl, unsubscribeUrl, assertProductionSafeFrom, sendViaResend, isSuppressed,
  DEFAULT_NOTIFY_FROM_EMAIL, resolveSendMode, assertProductionRuntimeGuard, assertProductionSendPreconditions,
  classifyUsersForDryRun, lookupDeliveryStatuses, runWithConcurrency, PRODUCTION_SEND_CONCURRENCY, exceedsMaxSend,
  buildDeliveryIdempotencyKey,
} from './lib/notification-mailer.mjs'

const SCRIPT_LABEL = 'notify-anr'
const CWD = process.cwd()
const ARGV = process.argv.slice(2)
const argVal = (name) => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const SEND_MODE = resolveSendMode(ARGV, SCRIPT_LABEL)
const MODE = SEND_MODE.mode // 'dry-run' | 'test-user' | 'production' | 'production-dry-run'
// SEND: RESEND_API_KEY/UNSUB_SECRETの存在を必須とするモードか（実送信するmodeだけでなく、
// production-dry-runもenv検証の一環として必須とする＝Step 4「env validation」）。
// 実際にResendへ到達し得るのは 'test-user' と 'production' のみ（production-dry-runは
// sendToTestUser/resendAndUpdateを一切呼ばない構造のため到達不可能）。
const SEND = MODE !== 'dry-run'
const TEST_USER = SEND_MODE.testUser
const MAX_SEND = SEND_MODE.maxSend
const DRY_RUN = MODE === 'dry-run'

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

const { sbSelect, sbSelectOptional, sbInsert, sbUpdate, sbUpsert, fetchAuthUser } = makeSupabaseHelpers(SB_URL, SB_KEY)

const JOB_NAME = 'actress_new_release'
const NOTIFICATION_TYPE = 'actress_new_release'
const DEFAULT_LOOKBACK_HOURS = Number(argVal('lookback-hours') ?? 24)
const STALE_PENDING_MINUTES = 30
// readVp()（src/lib/analytics.ts）は ?vp= を16文字にslice するため、この範囲に収める。
const VP_CODE = 'email_anr'

const jstDateLabel = (iso) => {
  if (!iso) return null
  const j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${j.getUTCFullYear()}年${j.getUTCMonth() + 1}月${j.getUTCDate()}日`
}

const AS_OF = (() => {
  const raw = argVal('as-of')
  if (!raw) return new Date()
  const d = new Date(raw)
  if (isNaN(d.getTime())) { console.error('FATAL --as-of must be a valid ISO datetime'); process.exit(2) }
  return d
})()

// ── videoa / DVD判定（src/lib/fastestReleases.ts rowHasVideoUrl と逐語一致）──────
function rowHasVideoUrl(metadata) {
  const url = typeof metadata?.url === 'string' ? metadata.url : null
  return !!url && !url.includes('/mono/dvd/')
}

// 作品metadata.actress[]（DMM iteminfo.actress）から dmm-actress-<id> 形式へ変換。
// src/lib/actressUrl.ts actressExternalIdFromNumericId と同じ規約。id<=0 は女優ページ不成立のため除外。
function actressEntriesToExternalIds(actressArr) {
  if (!Array.isArray(actressArr)) return []
  return actressArr
    .filter((a) => typeof a?.id === 'number' && a.id > 0 && typeof a?.name === 'string')
    .map((a) => ({ externalId: `dmm-actress-${a.id}`, name: a.name }))
}

function articleHref(slug) {
  return buildTrackedUrl(`${SITE_URL}/verity/articles/${slug}`, VP_CODE)
}

// ── メール本文生成 ───────────────────────────────────────────────────────────
// groups: [{ label: '彩月七緒さん', articles: [{ title, slug, publishedAt }] }]
// unsubUrl: この通知種別だけを止める人間向けリンク（null可＝dry-runプレビュー時など）
// unsubAllUrl: VERITYの全メール通知を停止する人間向けリンク（同上）
// ※ List-Unsubscribe（One-Click）は必ずこの通知種別のみを対象にする。
//    「すべて停止」はメール本文内の明示クリックからのみ到達させ、
//    メールクライアントのワンクリック操作だけで全停止にならないようにする。
function buildEmail(groups, unsubUrl, unsubAllUrl) {
  const totalArticles = groups.reduce((s, g) => s + g.articles.length, 0)
  const subject = totalArticles <= 1
    ? '【VERITY】お気に入り女優の最新作情報が到着しました！'
    : `【VERITY】お気に入り女優の最新作が${totalArticles}作品到着しました！`

  const profileUrl = `${SITE_URL}/verity/profile`
  const textLines = [
    'VERITYでお気に入り登録している女優の',
    '最新作情報が到着しました。',
    '',
  ]
  const htmlBlocks = []

  for (const g of groups) {
    textLines.push(`■ ${g.label}`, '')
    const htmlItems = []
    for (const a of g.articles) {
      const href = articleHref(a.slug)
      const dateLabel = jstDateLabel(a.publishedAt)
      textLines.push(`・${a.title}`)
      if (dateLabel) textLines.push(`  配信開始日：${dateLabel}`)
      textLines.push(`  → VERITYで見る: ${href}`, '')
      htmlItems.push(`
        <li style="margin-bottom:12px">
          <div style="font-weight:bold">${escapeHtml(a.title)}</div>
          ${dateLabel ? `<div style="font-size:13px;color:#666">配信開始日：${dateLabel}</div>` : ''}
          <div><a href="${href}" style="color:#E20074">→ VERITYで最新作を見る</a></div>
        </li>`)
    }
    htmlBlocks.push(`
      <h3 style="color:#E20074;font-size:15px;margin:20px 0 8px">■ ${escapeHtml(g.label)}</h3>
      <ul style="list-style:none;padding:0;margin:0">${htmlItems.join('')}</ul>`)
  }

  textLines.push('通知はいつでもマイページからOFFにできます。', `通知設定を変更する: ${profileUrl}`)
  if (unsubUrl) textLines.push(`この新作通知を停止する: ${unsubUrl}`)
  if (unsubAllUrl) textLines.push(`すべてのメール通知を停止する: ${unsubAllUrl}`)

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;color:#1a1a1a">
      <h2 style="color:#E20074;border-bottom:2px solid #E20074;padding-bottom:8px">VERITY</h2>
      <p>VERITYでお気に入り登録している女優の<br/>最新作情報が到着しました。</p>
      ${htmlBlocks.join('')}
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
      <p style="font-size:12px;color:#999">
        通知はいつでもマイページからOFFにできます。<br/>
        <a href="${profileUrl}" style="color:#999">通知設定を変更する</a>
        ${unsubUrl ? ` ／ <a href="${unsubUrl}" style="color:#999">この新作通知を停止する</a>` : ''}
        ${unsubAllUrl ? ` ／ <a href="${unsubAllUrl}" style="color:#999">すべてのメール通知を停止する</a>` : ''}
      </p>
    </div>`

  return { subject, text: textLines.join('\n'), html }
}

// ── メイン ───────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  console.log(`\nSTART notify-actress-new-release started_at=${jstIso()} mode=${MODE.toUpperCase()}${TEST_USER ? ` test_user=${TEST_USER}` : ''}${MAX_SEND ? ` max_send=${MAX_SEND}` : ''}`)
  if (TEST_USER) console.log('*** TEST MODE — 対象は指定ユーザー1名のみ ***')
  if (MODE === 'production' || MODE === 'production-dry-run') {
    console.log(MODE === 'production'
      ? '*** PRODUCTION SEND MODE — 全会員が対象です（安全ガード通過後のみ送信） ***'
      : '*** PRODUCTION DRY-RUN — 対象抽出・env検証・max-send検証のみ。Resend呼び出し・DB書込みは一切行いません ***')
    // production-dry-runもVPS専用ガードを通す（Step 4）。ただしこのモードは
    // sendToTestUser/resendAndUpdateを一度も呼ばない構造のため、ガードにバグがあっても
    // 実送信には到達し得ない（Resend呼び出しコード自体がこの分岐に存在しない）。
    assertProductionRuntimeGuard(SCRIPT_LABEL)
    await assertProductionSendPreconditions({
      scriptLabel: SCRIPT_LABEL, resendApiKey: RESEND_API_KEY, fromAddr: FROM_ADDR,
      unsubSecret: UNSUB_SECRET, siteUrl: SITE_URL, sbSelectOptional,
    })
    console.log('production安全条件チェック: OK')
  }

  // ── ウォーターマーク解決 ────────────────────────────────────────────────────
  let watermark
  const watermarkOverride = argVal('watermark')
  if (watermarkOverride) {
    watermark = new Date(watermarkOverride)
    console.log(`watermark: override指定を使用 -> ${jstIso(watermark)}`)
  } else {
    const state = await sbSelectOptional(`notification_job_state?job_name=eq.${JOB_NAME}&select=watermark,updated_at`)
    if (state.missing) {
      console.log('watermark: notification_job_state テーブルが未作成（migration 047 未適用）— lookback既定値にフォールバック')
      watermark = new Date(AS_OF.getTime() - DEFAULT_LOOKBACK_HOURS * 3600 * 1000)
    } else if (state.rows.length === 0) {
      console.log(`watermark: 保存済み値なし（初回実行）— lookback ${DEFAULT_LOOKBACK_HOURS}h 前を使用`)
      watermark = new Date(AS_OF.getTime() - DEFAULT_LOOKBACK_HOURS * 3600 * 1000)
    } else {
      watermark = new Date(state.rows[0].watermark)
      console.log(`watermark: 保存値を使用 -> ${jstIso(watermark)} (前回更新 ${state.rows[0].updated_at})`)
    }
  }
  console.log(`window: (${jstIso(watermark)}, ${jstIso(AS_OF)}]`)

  // ── 候補articles抽出（is_active=true, floor=videoa, fetched_at範囲）──────────
  const q = new URLSearchParams({
    select: 'external_id,slug,title,published_at,fetched_at,metadata',
    is_active: 'eq.true',
    'metadata->>floor': 'eq.videoa',
    fetched_at: `gt.${watermark.toISOString()}`,
    order: 'fetched_at.asc',
    limit: '2000',
  })
  const rawCandidates = await sbSelect(`articles?${q.toString()}&fetched_at=${encodeURIComponent('lte.' + AS_OF.toISOString())}`)

  const candidates = rawCandidates.filter((a) =>
    rowHasVideoUrl(a.metadata) &&
    !!a.slug &&
    !!a.title &&
    Array.isArray(a.metadata?.actress) && a.metadata.actress.length > 0,
  )
  console.log(`articles: 候補範囲=${rawCandidates.length}件 / videoa+DVD除外+slug成立後=${candidates.length}件`)

  // ── 候補記事から参照される女優 external_id を収集 ─────────────────────────────
  const actressExtIdSet = new Set()
  const articleActressMap = new Map()
  for (const a of candidates) {
    const entries = actressEntriesToExternalIds(a.metadata.actress)
    articleActressMap.set(a.external_id, entries)
    for (const e of entries) actressExtIdSet.add(e.externalId)
  }
  console.log(`actresses referenced in candidates: ${actressExtIdSet.size}人`)

  if (actressExtIdSet.size === 0) {
    console.log('対象女優なし — 送信対象0件で終了')
    await finalizeWatermark(watermark, MODE === 'production')
    printDone(t0, { articles: 0, actresses: 0, users: 0, emails: 0 })
    return
  }

  const extIdList = [...actressExtIdSet]
  const actressRows = await sbSelectChunked('actresses', 'id,external_id,name', 'external_id', extIdList, 'eq.true')
  console.log(`actresses table 一致: ${actressRows.length}人`)

  if (actressRows.length === 0) {
    console.log('VERITY女優テーブルに一致する行なし — 送信対象0件で終了')
    await finalizeWatermark(watermark, MODE === 'production')
    printDone(t0, { articles: candidates.length, actresses: 0, users: 0, emails: 0 })
    return
  }

  const internalIds = actressRows.map((r) => r.id)
  const favRows = await sbSelectChunked('favorite_actresses', 'user_id,actress_id', 'actress_id', internalIds)
  console.log(`favorite_actresses 一致行: ${favRows.length}件`)

  let relevantFav = favRows
  if (TEST_USER) relevantFav = favRows.filter((r) => r.user_id === TEST_USER)

  const userIds = [...new Set(relevantFav.map((r) => r.user_id))]
  if (userIds.length === 0) {
    console.log('対象お気に入りユーザーなし — 送信対象0件で終了')
    await finalizeWatermark(watermark, MODE === 'production')
    printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: 0, emails: 0 })
    return
  }

  // ── favorite_notification_settings: notify_new_work 判定（行なし=true既定） ──
  const settingsRows = await sbSelectChunked('favorite_notification_settings', 'user_id,notify_new_work', 'user_id', userIds)
  const settingsMap = new Map(settingsRows.map((r) => [r.user_id, r.notify_new_work]))
  let eligibleUserIds = userIds.filter((uid) => settingsMap.get(uid) !== false)

  // ── bounce/complaint抑止（notification_email_status。Phase 4新規・未適用なら何も抑止しない） ──
  const suppressedIds = new Set()
  for (const uid of eligibleUserIds) {
    if (await isSuppressed({ sbSelectOptional }, uid)) suppressedIds.add(uid)
  }
  if (suppressedIds.size > 0) eligibleUserIds = eligibleUserIds.filter((uid) => !suppressedIds.has(uid))
  console.log(`notify_new_work対象: ${eligibleUserIds.length}/${userIds.length}人（false明示除外・bounce/complaint抑止${suppressedIds.size}人除外）`)

  const internalToExtName = new Map(actressRows.map((r) => [r.id, { externalId: r.external_id, name: r.name }]))

  const userFavActressExtIds = new Map()
  for (const r of relevantFav) {
    if (!eligibleUserIds.includes(r.user_id)) continue
    const info = internalToExtName.get(r.actress_id)
    if (!info) continue
    if (!userFavActressExtIds.has(r.user_id)) userFavActressExtIds.set(r.user_id, new Set())
    userFavActressExtIds.get(r.user_id).add(info.externalId)
  }

  const userArticles = new Map()
  for (const a of candidates) {
    const entries = articleActressMap.get(a.external_id) ?? []
    if (entries.length === 0) continue
    for (const [uid, favSet] of userFavActressExtIds) {
      const matched = entries.filter((e) => favSet.has(e.externalId))
      if (matched.length === 0) continue
      if (!userArticles.has(uid)) userArticles.set(uid, new Map())
      const bucket = userArticles.get(uid)
      if (!bucket.has(a.external_id)) {
        bucket.set(a.external_id, { article: a, matchedNames: new Set(), matchedExtIds: new Set() })
      }
      for (const m of matched) {
        bucket.get(a.external_id).matchedNames.add(m.name)
        bucket.get(a.external_id).matchedExtIds.add(m.externalId)
      }
    }
  }

  const digestUserIds = [...userArticles.keys()]
  console.log(`ダイジェスト対象ユーザー: ${digestUserIds.length}人`)

  const digests = new Map()
  for (const uid of digestUserIds) {
    const bucket = userArticles.get(uid)
    const groupOrder = []
    const groupMap = new Map()
    for (const { article, matchedNames, matchedExtIds } of bucket.values()) {
      const label = [...matchedNames].join('さん、') + 'さん'
      if (!groupMap.has(label)) { groupMap.set(label, []); groupOrder.push(label) }
      groupMap.get(label).push({
        title: article.title, slug: article.slug, publishedAt: article.published_at, cid: article.external_id,
        actressIds: [...matchedExtIds], actressNames: [...matchedNames],
      })
    }
    const groups = groupOrder.map((label) => ({ label, articles: groupMap.get(label) }))
    const totalArticles = groups.reduce((s, g) => s + g.articles.length, 0)
    digests.set(uid, { groups, totalArticles })
  }

  const groupKeyToday = jstDateKey(AS_OF)

  // ── production-send / production-dry-run: 送信開始前にmax-send上限チェック（Step 11）──
  // 超過分だけ打ち切ることはしない（全件送るか0件かのみ許可）。純粋関数exceedsMaxSendは
  // I/O無しで単体テスト可能（インシデント対応 Step 6）。
  if ((MODE === 'production' || MODE === 'production-dry-run') && exceedsMaxSend(digestUserIds.length, MAX_SEND)) {
    throw new Error(
      `[${SCRIPT_LABEL}] 対象ユーザー数(${digestUserIds.length})が --max-send=${MAX_SEND} を超過しました。` +
      '安全のため送信を中止します（0通・全件送るか0件かのみ許可）。',
    )
  }

  // ── test-userモード（Phase 2から変更なし。ロジックを壊さない） ────────────────────
  if (TEST_USER) {
    console.log('\n─── 対象ユーザー内訳 ───')
    const digest = digests.get(TEST_USER)
    if (digest) {
      const cids = digest.groups.flatMap((g) => g.articles.map((a) => a.cid)).join(',')
      const names = digest.groups.map((g) => g.label).join(' / ')
      console.log(`user=${TEST_USER.slice(0, 8)}… articles=${digest.totalArticles} actresses=[${names}] cids=[${cids}]`)
    }
    if (!digest) {
      console.log(`\ntest-user ${TEST_USER} は今回の対象になりません（お気に入り女優の新作なし、notify_new_work=false、bounce/complaint抑止、またはお気に入り未登録）。`)
      printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digests.size, emails: 0 })
      return
    }

    const previewUnsubUrl = UNSUB_SECRET ? unsubscribeUrl(SITE_URL, UNSUB_SECRET, TEST_USER, NOTIFICATION_TYPE) : null
    const previewUnsubAllUrl = UNSUB_SECRET ? unsubscribeUrl(SITE_URL, UNSUB_SECRET, TEST_USER, 'all') : null
    const email = buildEmail(digest.groups, previewUnsubUrl, previewUnsubAllUrl)
    console.log('\n─── 生成メールプレビュー（test-user） ───')
    console.log(`件名: ${email.subject}`)
    console.log('本文(text):\n' + email.text)

    const authUser = await fetchAuthUser(TEST_USER)
    if (!authUser || authUser.deleted_at) {
      console.log(`\ntest-user ${TEST_USER} の有効な auth.users 行が見つかりません（退会済みの可能性）。送信しません。`)
      printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digests.size, emails: 0 })
      return
    }
    console.log(`宛先: ${maskEmail(authUser.email)}`)

    if (!SEND) {
      console.log('\n(dry-run のため実送信・DB書込みは行っていません。--send を追加すると実送信されます)')
      printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digests.size, emails: 0 })
      return
    }

    assertProductionSafeFrom(FROM_ADDR, true) // true = test-user mode
    const wasSent = await sendToTestUser(TEST_USER, authUser.email, email, digest.groups)
    printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digests.size, emails: wasSent ? 1 : 0 })
    return
  }

  // ── production-send モード（Phase 5A新規。Phase 5Aでは呼ばれ得ない — NOTIFICATION_RUNTIME
  //    未設定のためVPSでも到達しない。コードとしてはここまで実装しておく） ─────────────
  if (MODE === 'production') {
    console.log(`\n*** PRODUCTION SEND — 対象${digestUserIds.length}人へ送信します（max-send=${MAX_SEND}） ***`)
    const summary = await runProductionSend(digestUserIds, digests, groupKeyToday)
    printSendSummary(summary, t0)
    if (summary.failed === 0) {
      await finalizeWatermark(watermark, true)
    } else {
      console.log(`\n${summary.failed}件の失敗があったため watermark を前進させません（次回実行時にfailed分をretryします。sent済みユーザーはskipされます）。`)
      process.exitCode = 1
    }
    printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digestUserIds.length, emails: summary.sent })
    return
  }

  // ── production-dry-run（インシデント対応で新設）。sendToTestUser/resendAndUpdate/
  //    runProductionSendのいずれも呼ばない＝Resend呼び出しコード自体がこの分岐に存在しない。
  //    対象抽出・env検証・max-send検証はproduction-sendと完全同一ロジック（上のmax-send
  //    チェック・上のガード呼び出しを共有）。DB書込み・watermark前進も一切行わない。 ─────
  if (MODE === 'production-dry-run') {
    console.log(`\n*** PRODUCTION DRY-RUN 結果 — max-send=${MAX_SEND}以内、対象${digestUserIds.length}人（実送信0・DB書込み0） ***`)
    if (digestUserIds.length === 0) {
      console.log('対象ユーザー0人')
    } else {
      const authMap = await classifyUsersForDryRun(digestUserIds, fetchAuthUser)
      const deliveryMap = await lookupDeliveryStatuses(sbSelect, NOTIFICATION_TYPE, groupKeyToday, digestUserIds)
      printFullDryRunReport(digestUserIds, digests, authMap, deliveryMap)
    }
    printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digestUserIds.length, emails: 0 })
    return
  }

  // ── dry-run（全会員・実データ集計。Phase 5A新規強化） ───────────────────────────
  console.log('\n─── 全会員dry-run 集計 ───')
  if (digestUserIds.length === 0) {
    console.log('対象ユーザー0人')
  } else {
    const authMap = await classifyUsersForDryRun(digestUserIds, fetchAuthUser)
    const deliveryMap = await lookupDeliveryStatuses(sbSelect, NOTIFICATION_TYPE, groupKeyToday, digestUserIds)
    printFullDryRunReport(digestUserIds, digests, authMap, deliveryMap)
  }
  printDone(t0, { articles: candidates.length, actresses: actressRows.length, users: digestUserIds.length, emails: 0 })
}

// ── 全会員dry-run集計・表示（Step 8 / Step 10） ─────────────────────────────────
function printFullDryRunReport(digestUserIds, digests, authMap, deliveryMap) {
  let noEmail = 0, unconfirmed = 0, noAccount = 0, sentAlready = 0, pendingRecent = 0, retryCount = 0, newCount = 0
  const rows = []
  for (const uid of digestUserIds) {
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
    rows.push({ uid, email: info.authUser?.email, reason, digest: digests.get(uid) })
  }

  console.log(`対象ユーザー数(候補): ${digestUserIds.length}`)
  console.log(`  生成予定メール数: ${newCount}（うちfailed/stale-pending retry候補: ${retryCount}）`)
  console.log(`  既にsent済み(スキップ): ${sentAlready}`)
  console.log(`  pending処理中・直近${STALE_PENDING_MINUTES}分以内(スキップ): ${pendingRecent}`)
  console.log(`  emailなし(スキップ): ${noEmail}`)
  console.log(`  email未確認(スキップ): ${unconfirmed}`)
  console.log(`  authアカウントなし(スキップ): ${noAccount}`)

  console.log('\n─── 対象ユーザー内訳（先頭20件、メールはマスク） ───')
  for (const r of rows.slice(0, 20)) {
    const names = r.digest.groups.map((g) => g.label).join(' / ')
    console.log(`  user=${r.uid.slice(0, 8)}… email=${maskEmail(r.email)} articles=${r.digest.totalArticles} actresses=[${names}] reason=${r.reason}`)
  }
  if (rows.length > 20) console.log(`  …他${rows.length - 20}人`)
}

// ── production-send 実行本体（Step 15-18）。sendToTestUser/resendAndUpdateは変更せず再利用。──
async function runProductionSend(digestUserIds, digests, groupKey) {
  const summary = {
    total_candidates: digestUserIds.length, sent: 0, skipped_sent: 0, skipped_pending_recent: 0,
    skipped_no_email: 0, skipped_unconfirmed: 0, skipped_no_account: 0, failed: 0, pending_retried: 0,
  }
  await runWithConcurrency(digestUserIds, PRODUCTION_SEND_CONCURRENCY, async (uid) => {
    const authUser = await fetchAuthUser(uid)
    const cls = authUser && !authUser.deleted_at
      ? (!authUser.email ? 'no_email' : (!authUser.email_confirmed_at ? 'unconfirmed' : 'ok'))
      : 'no_account'
    if (cls === 'no_account') { summary.skipped_no_account++; return }
    if (cls === 'no_email') { summary.skipped_no_email++; return }
    if (cls === 'unconfirmed') { summary.skipped_unconfirmed++; return }

    const digest = digests.get(uid)
    const unsubUrlForUser = unsubscribeUrl(SITE_URL, UNSUB_SECRET, uid, NOTIFICATION_TYPE)
    const unsubAllUrlForUser = unsubscribeUrl(SITE_URL, UNSUB_SECRET, uid, 'all')
    const emailContent = buildEmail(digest.groups, unsubUrlForUser, unsubAllUrlForUser)

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
      const ok = await resendAndUpdate(row.id, uid, authUser.email, emailContent)
      if (ok) summary.sent++; else summary.failed++
      return
    }

    const payload = buildAuditPayload(emailContent, groupKey, digest.groups)
    const ins = await sbInsert('notification_deliveries', [{
      user_id: uid, notification_type: NOTIFICATION_TYPE, group_key: groupKey,
      entity_type: 'daily_digest', payload, status: 'pending',
    }])
    if (!ins.ok) {
      if (ins.status === 409) { summary.skipped_pending_recent++; return }
      console.error(`INSERT失敗 user=${uid.slice(0, 8)}… HTTP ${ins.status}`)
      summary.failed++
      return
    }
    const id = ins.body?.[0]?.id
    const ok = await resendAndUpdate(id, uid, authUser.email, emailContent)
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

async function sbSelectChunked(table, select, inColumn, values, isActiveFilterForActresses) {
  const out = []
  for (let i = 0; i < values.length; i += 100) {
    const chunk = values.slice(i, i + 100)
    const inList = chunk.map((v) => `"${v}"`).join(',')
    let qs = `${table}?select=${select}&${inColumn}=in.(${encodeURIComponent(inList)})`
    if (table === 'actresses' && isActiveFilterForActresses) qs += `&is_active=${isActiveFilterForActresses}`
    const rows = await sbSelect(qs)
    out.push(...rows)
  }
  return out
}

// forceAdvance=true のときのみ実際に前進する（production-send成功時のみ呼び出し元がtrueを渡す）。
// dry-run/test-userは常にfalse相当のため、この関数は事実上何もしない（Step 9/13）。
async function finalizeWatermark(oldWatermark, forceAdvance = false) {
  if (!forceAdvance) return
  try {
    await sbUpsert('notification_job_state', { job_name: JOB_NAME, watermark: AS_OF.toISOString(), updated_at: new Date().toISOString() }, 'job_name')
    console.log(`watermark advanced: ${jstIso(oldWatermark)} -> ${jstIso(AS_OF)}`)
  } catch (err) {
    console.error('watermark advance failed (notification_job_state 未適用の可能性):', sanitizeError(err))
  }
}

async function sendToTestUser(userId, email, emailContent, groups) {
  const groupKey = jstDateKey(AS_OF)
  const matchQuery = `user_id=eq.${userId}&notification_type=eq.${NOTIFICATION_TYPE}&group_key=eq.${groupKey}`
  const existing = await sbSelect(`notification_deliveries?select=id,status,created_at&${matchQuery}`)

  if (existing.length > 0) {
    const row = existing[0]
    if (row.status === 'sent') {
      console.log(`\n既に本日分は送信済み(status=sent, id=${row.id})のため再送しません。`)
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

  const payload = buildAuditPayload(emailContent, groupKey, groups)
  const ins = await sbInsert('notification_deliveries', [{
    user_id: userId, notification_type: NOTIFICATION_TYPE, group_key: groupKey,
    entity_type: 'daily_digest', payload, status: 'pending',
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

function buildAuditPayload(emailContent, groupKey, groups) {
  const articles = groups.flatMap((g) => g.articles).map((a) => ({
    cid: a.cid, slug: a.slug, actress_ids: a.actressIds, actress_names: a.actressNames,
  }))
  return { date: groupKey, subject: emailContent.subject, articles }
}

async function resendAndUpdate(deliveryId, userId, email, emailContent) {
  console.log(`\n*** [${MODE.toUpperCase()}] Resendへ実送信します — to=${maskEmail(email)} from=${FROM_ADDR} ***`)
  try {
    const unsubUrl = unsubscribeUrl(SITE_URL, UNSUB_SECRET, userId, NOTIFICATION_TYPE)
    const json = await sendViaResend({
      apiKey: RESEND_API_KEY, from: FROM_ADDR, to: email, replyTo: REPLY_TO,
      subject: emailContent.subject, html: emailContent.html, text: emailContent.text,
      unsubscribeUrl: unsubUrl,
      idempotencyKey: buildDeliveryIdempotencyKey('anr-delivery', deliveryId),
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
    `\nDONE notify-actress-new-release mode=${MODE.toUpperCase()} ` +
    `articles=${stats.articles} actresses=${stats.actresses} users=${stats.users} emails_sent=${stats.emails} ` +
    `finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
}

main().catch((err) => {
  console.error('FATAL', sanitizeError(err))
  process.exit(1)
})
