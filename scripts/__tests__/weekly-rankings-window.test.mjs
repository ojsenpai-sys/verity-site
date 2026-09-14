// scripts/__tests__/weekly-rankings-window.test.mjs
// 実行: node --test scripts/__tests__/weekly-rankings-window.test.mjs
//
// scripts/lib/weekly-rankings-window.mjs の pure ロジック
// (computeWindow / buildComputeQuery / buildApplyQuery / withClient / runWeeklyRankings)
// を対象とする。DB接続は行わない(withClient/runWeeklyRankingsはduck-typedモックで検証)。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeWindow,
  buildComputeQuery,
  buildApplyQuery,
  withClient,
  runWeeklyRankings,
  stripSslModeParam,
} from '../lib/weekly-rankings-window.mjs'

// ── computeWindow ────────────────────────────────────────────────────────────
test('computeWindow: --week指定時、published_atは実行時刻に依存せず対象週の日曜23:30 JSTになる(backfill時の正確性)', () => {
  // 実行時刻が2026-08-31(未来)でも、--week=2026-08-17指定時はpublished_atが過去日付のまま保持される
  const w = computeWindow({ weekArg: '2026-08-17', publishNow: false, now: new Date('2026-08-31T04:00:00+09:00') })
  assert.equal(w.weekKey, '2026-08-17')
  assert.equal(w.periodStart, '2026-08-17T00:00:00+09:00')
  assert.equal(w.periodEnd, '2026-08-23T23:00:00+09:00')
  assert.equal(w.prevStart, '2026-08-10T00:00:00+09:00')
  assert.equal(w.prevEnd, '2026-08-17T00:00:00+09:00')
  assert.equal(w.publishedAt, '2026-08-23T23:30:00+09:00')
})

test('computeWindow: 次のbackfill対象週(2026-08-24)も同様にpublished_atが保持される', () => {
  const w = computeWindow({ weekArg: '2026-08-24', publishNow: false, now: new Date('2026-09-05T00:00:00+09:00') })
  assert.equal(w.weekKey, '2026-08-24')
  assert.equal(w.periodStart, '2026-08-24T00:00:00+09:00')
  assert.equal(w.periodEnd, '2026-08-30T23:00:00+09:00')
  assert.equal(w.prevStart, '2026-08-17T00:00:00+09:00')
  assert.equal(w.prevEnd, '2026-08-24T00:00:00+09:00')
  assert.equal(w.publishedAt, '2026-08-30T23:30:00+09:00')
})

test('computeWindow: --publish-now指定時のみpublished_atが現在時刻ベースになる', () => {
  const w = computeWindow({ weekArg: '2026-08-17', publishNow: true, now: new Date('2026-08-31T04:00:00+09:00') })
  assert.equal(w.publishedAt, '2026-08-31T04:00:00+09:00')
})

test('computeWindow: --week未指定時は現在時刻からJST週(月曜起点)を算出する(日曜のnowも正しく同週の月曜へ)', () => {
  // 2026-08-16は日曜(JST)。この日に実行した場合、その週の月曜(2026-08-10)が対象になるべき
  const w = computeWindow({ now: new Date('2026-08-16T23:10:00+09:00') })
  assert.equal(w.weekKey, '2026-08-10')
  assert.equal(w.publishedAt, '2026-08-16T23:30:00+09:00')
})

test('computeWindow: --weekの形式が不正なら例外を投げる', () => {
  assert.throws(() => computeWindow({ weekArg: '2026/08/17' }), /--week must be YYYY-MM-DD/)
})

// ── buildComputeQuery / buildApplyQuery ────────────────────────────────────
test('buildComputeQuery: 6個の位置引数が043版compute_weekly_rankingsのsignature順と一致する', () => {
  const w = computeWindow({ weekArg: '2026-08-17' })
  const { text, values } = buildComputeQuery(w, 180)
  assert.match(text, /public\.compute_weekly_rankings/)
  assert.match(text, /p_period_start\s*=>\s*\$1/)
  assert.match(text, /p_period_end\s*=>\s*\$2/)
  assert.match(text, /p_prev_start\s*=>\s*\$3/)
  assert.match(text, /p_prev_end\s*=>\s*\$4/)
  assert.match(text, /p_week_key\s*=>\s*\$5/)
  assert.match(text, /p_newcomer_days\s*=>\s*\$6/)
  assert.deepEqual(values, [w.periodStart, w.periodEnd, w.prevStart, w.prevEnd, w.weekKey, 180])
})

test('buildApplyQuery: 7個の位置引数が041版apply_weekly_rankingsのsignature順(p_published_at含む)と一致する', () => {
  const w = computeWindow({ weekArg: '2026-08-17' })
  const { text, values } = buildApplyQuery(w, 180)
  assert.match(text, /public\.apply_weekly_rankings/)
  assert.match(text, /p_period_start\s*=>\s*\$1/)
  assert.match(text, /p_period_end\s*=>\s*\$2/)
  assert.match(text, /p_prev_start\s*=>\s*\$3/)
  assert.match(text, /p_prev_end\s*=>\s*\$4/)
  assert.match(text, /p_published_at\s*=>\s*\$5/)
  assert.match(text, /p_week_key\s*=>\s*\$6/)
  assert.match(text, /p_newcomer_days\s*=>\s*\$7/)
  assert.deepEqual(values, [w.periodStart, w.periodEnd, w.prevStart, w.prevEnd, w.publishedAt, w.weekKey, 180])
})

// ── withClient (connection lifecycle) ──────────────────────────────────────
function makeMockClient({ connectShouldFail = false, queryImpl = null } = {}) {
  const calls = { connect: 0, query: [], end: 0 }
  return {
    calls,
    async connect() {
      calls.connect++
      if (connectShouldFail) throw new Error('connect failed')
    },
    async query(text, values) {
      calls.query.push({ text, values })
      if (queryImpl) return queryImpl(text, values)
      return { rows: [{}] }
    },
    async end() {
      calls.end++
    },
  }
}

test('withClient: 正常時はconnect→SET statement_timeout→fn実行→endの順で1回ずつ呼ばれる', async () => {
  const client = makeMockClient()
  const result = await withClient(() => client, '60s', async (c) => {
    assert.equal(c, client)
    return 'ok'
  })
  assert.equal(result, 'ok')
  assert.equal(client.calls.connect, 1)
  assert.equal(client.calls.end, 1)
  assert.equal(client.calls.query.length, 1)
  assert.match(client.calls.query[0].text, /SET statement_timeout = '60s'/)
})

test('withClient: fn内で例外が投げられてもendは必ず呼ばれる(接続リークしない)', async () => {
  const client = makeMockClient()
  await assert.rejects(
    withClient(() => client, '60s', async () => { throw new Error('boom') }),
    /boom/,
  )
  assert.equal(client.calls.end, 1)
})

// ── runWeeklyRankings (fail-closed制御) ─────────────────────────────────────
test('runWeeklyRankings: dry-run(apply=false)ではapply_weekly_rankingsが一切呼ばれない', async () => {
  const w = computeWindow({ weekArg: '2026-08-17' })
  const client = makeMockClient({
    queryImpl: (text) => {
      if (/compute_weekly_rankings/.test(text)) return { rows: [{ result: [{ ranking_type: 'actress', rank: 1 }] }] }
      throw new Error('apply should not be called in dry-run')
    },
  })
  const { rows, applyResult } = await runWeeklyRankings(client, { w, newcomerDays: 180, apply: false })
  assert.equal(rows.length, 1)
  assert.equal(applyResult, null)
  assert.equal(client.calls.query.length, 1) // computeのみ
})

test('runWeeklyRankings: compute失敗時はapply_weekly_rankingsが呼ばれない(fail-closed)', async () => {
  const w = computeWindow({ weekArg: '2026-08-17' })
  const client = makeMockClient({
    queryImpl: (text) => {
      if (/compute_weekly_rankings/.test(text)) {
        const err = new Error('canceling statement due to statement timeout')
        err.code = '57014'
        throw err
      }
      throw new Error('apply should not be called after compute failure')
    },
  })
  await assert.rejects(
    runWeeklyRankings(client, { w, newcomerDays: 180, apply: true }),
    /statement timeout/,
  )
  assert.equal(client.calls.query.length, 1) // computeのみ試行され、applyへは進んでいない
})

test('runWeeklyRankings: apply=trueかつcompute成功時はapply_weekly_rankingsも呼ばれ、結果を返す', async () => {
  const w = computeWindow({ weekArg: '2026-08-17' })
  const client = makeMockClient({
    queryImpl: (text) => {
      if (/compute_weekly_rankings/.test(text)) return { rows: [{ result: Array.from({ length: 50 }, (_, i) => ({ rank: i })) }] }
      if (/apply_weekly_rankings/.test(text)) return { rows: [{ result: { week_key: w.weekKey, inserted: 50 } }] }
      throw new Error('unexpected query')
    },
  })
  const { rows, applyResult } = await runWeeklyRankings(client, { w, newcomerDays: 180, apply: true })
  assert.equal(rows.length, 50)
  assert.deepEqual(applyResult, { week_key: '2026-08-17', inserted: 50 })
  assert.equal(client.calls.query.length, 2) // compute → apply の順
  assert.match(client.calls.query[0].text, /compute_weekly_rankings/)
  assert.match(client.calls.query[1].text, /apply_weekly_rankings/)
})

// ── stripSslModeParam (Phase WR-3 STEP7: SELF_SIGNED_CERT_IN_CHAIN 修正) ────────
// テスト用のパスワードはダミー値であり実secretではない。テスト自体もassertの結果を
// console.logせず、失敗時のみnode:testが期待値/実際値を出力する標準動作に委ねる。
const FAKE_PASSWORD = 'dummy_test_password_not_real'
const RAW_URL = `postgresql://verity_weekly_rankings.projectref:${FAKE_PASSWORD}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require`

test('stripSslModeParam: sslmodeパラメータだけが削除される', () => {
  const cleaned = stripSslModeParam(RAW_URL)
  assert.doesNotMatch(cleaned, /sslmode/)
})

test('stripSslModeParam: host/user/password/db名/portは保持される', () => {
  const cleaned = stripSslModeParam(RAW_URL)
  const u = new URL(cleaned)
  assert.equal(u.hostname, 'aws-1-ap-northeast-1.pooler.supabase.com')
  assert.equal(u.port, '5432')
  assert.equal(u.username, 'verity_weekly_rankings.projectref')
  assert.equal(decodeURIComponent(u.password), FAKE_PASSWORD)
  assert.equal(u.pathname, '/postgres')
})

test('stripSslModeParam: sslmode以外の既存クエリパラメータは保持される', () => {
  const withExtra = RAW_URL + '&application_name=verity_weekly_rankings'
  const cleaned = stripSslModeParam(withExtra)
  assert.doesNotMatch(cleaned, /sslmode/)
  assert.match(cleaned, /application_name=verity_weekly_rankings/)
})

test('stripSslModeParam: 不正なURL文字列に対しては例外を投げる(fail-closed)', () => {
  assert.throws(() => stripSslModeParam('not-a-valid-url'))
  assert.throws(() => stripSslModeParam(''))
})
