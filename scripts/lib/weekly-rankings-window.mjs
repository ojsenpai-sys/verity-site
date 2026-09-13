// scripts/lib/weekly-rankings-window.mjs
// generate-weekly-rankings.mjs から DB/ネットワーク依存を切り離した pure ロジック。
// node:test で直接テスト可能(DB接続不要)。
//
// Phase WR-2: PostgREST(authenticator, statement_timeout=8s)経由の
// rpc('compute_weekly_rankings')/rpc('apply_weekly_rankings') 呼び出しを、
// Direct/Pooler PostgreSQL接続への直接SQL呼び出しへ置き換える際に、
// 週境界計算・SQL構築・実行制御(compute失敗時はapplyしない)を
// pure関数として分離した。週境界計算そのもの(computeWindow)のロジックは
// 従来のPostgREST版から一切変更していない(挙動を変えず呼び出し経路のみ変更する方針)。

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/**
 * Phase WR-3: connectionString内の `sslmode` パラメータだけを取り除いた文字列を返す純粋関数。
 * node-postgres は connectionString 内に sslmode があると、Client() へ別途渡した ssl オプション
 * (`{ rejectUnauthorized: false }`)と競合し、本番Session Pooler接続が
 * SELF_SIGNED_CERT_IN_CHAIN で失敗することを実機検証で確認した(STEP 5/5B)。
 * host/user/password/db名・他のクエリパラメータは変更しない。parse失敗時は例外を投げる
 * (呼び出し側でfail-closedに扱う — 無効なURLをそのままClientへ渡して不明瞭な接続失敗にしない)。
 * @param {string} urlString
 * @returns {string}
 */
export function stripSslModeParam(urlString) {
  const parsed = new URL(urlString)
  parsed.searchParams.delete('sslmode')
  return parsed.toString()
}

/**
 * JST週境界を算出する。--week=YYYY-MM-DD で対象週(月曜)を明示指定可能(backfill用)。
 * published_at は常に「対象週の日曜23:30 JST」から算出され、実行時刻には依存しない
 * (--publish-now 指定時のみ現在時刻を使う)。
 * @param {{ weekArg?: string|null, publishNow?: boolean, now?: Date }} opts
 */
export function computeWindow({ weekArg = null, publishNow = false, now = new Date() } = {}) {
  let monday
  if (weekArg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekArg)) throw new Error('--week must be YYYY-MM-DD')
    const [y, m, d] = weekArg.split('-').map(Number)
    monday = new Date(Date.UTC(y, m - 1, d))
  } else {
    const jstNow = new Date(now.getTime() + 9 * 3600 * 1000)
    const y = jstNow.getUTCFullYear(), m = jstNow.getUTCMonth(), d = jstNow.getUTCDate()
    const dow = jstNow.getUTCDay() // 0=Sun..6=Sat (JST基準)
    const deltaToMonday = dow === 0 ? -6 : 1 - dow
    monday = new Date(Date.UTC(y, m, d) + deltaToMonday * 86400 * 1000)
  }
  const sunday = new Date(monday.getTime() + 6 * 86400 * 1000)
  const prevMonday = new Date(monday.getTime() - 7 * 86400 * 1000)
  const weekKey = isoDate(monday)
  const jstIsoNow = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '') + '+09:00'
  return {
    weekKey,
    periodStart: `${isoDate(monday)}T00:00:00+09:00`,
    periodEnd:   `${isoDate(sunday)}T23:00:00+09:00`,
    prevStart:   `${isoDate(prevMonday)}T00:00:00+09:00`,
    prevEnd:     `${isoDate(monday)}T00:00:00+09:00`,
    publishedAt: publishNow ? jstIsoNow : `${isoDate(sunday)}T23:30:00+09:00`,
  }
}

/**
 * public.compute_weekly_rankings(...) 呼び出し用の parameterized query を構築する。
 * 引数名は 043_weekly_rankings_maker_fix.sql の signature と一致させ、
 * $1.. の位置引数は名前付き呼び出し(=>)で束縛するため signature の宣言順変更に強い。
 */
export function buildComputeQuery(w, newcomerDays) {
  return {
    text: `SELECT public.compute_weekly_rankings(
      p_period_start  => $1::timestamptz,
      p_period_end    => $2::timestamptz,
      p_prev_start    => $3::timestamptz,
      p_prev_end      => $4::timestamptz,
      p_week_key      => $5::text,
      p_newcomer_days => $6::integer
    ) AS result`,
    values: [w.periodStart, w.periodEnd, w.prevStart, w.prevEnd, w.weekKey, newcomerDays],
  }
}

/**
 * public.apply_weekly_rankings(...) 呼び出し用の parameterized query を構築する。
 * 041_weekly_rankings.sql の signature と一致(p_published_at を含む7引数)。
 */
export function buildApplyQuery(w, newcomerDays) {
  return {
    text: `SELECT public.apply_weekly_rankings(
      p_period_start  => $1::timestamptz,
      p_period_end    => $2::timestamptz,
      p_prev_start    => $3::timestamptz,
      p_prev_end      => $4::timestamptz,
      p_published_at  => $5::timestamptz,
      p_week_key      => $6::text,
      p_newcomer_days => $7::integer
    ) AS result`,
    values: [w.periodStart, w.periodEnd, w.prevStart, w.prevEnd, w.publishedAt, w.weekKey, newcomerDays],
  }
}

/**
 * 接続の確立→statement_timeout設定→fn実行→(成功/失敗問わず)必ずclose、を保証する。
 * createClient は `pg.Client` 互換( .connect()/.query()/.end() を持つ)オブジェクトを返す関数。
 * DI可能にすることでnode:testからモッククライアントで検証できる。
 * @param {() => { connect: () => Promise<void>, query: (text: string, values?: any[]) => Promise<any>, end: () => Promise<void> }} createClient
 * @param {string} statementTimeout 例: '60s'。内部定数のみを想定(外部入力を埋め込まない)。
 * @param {(client: any) => Promise<any>} fn
 */
export async function withClient(createClient, statementTimeout, fn) {
  const client = createClient()
  await client.connect()
  try {
    await client.query(`SET statement_timeout = '${statementTimeout}'`)
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * compute→(applyがtrueの場合のみ)apply を同一クライアントで順に実行する。
 * compute が例外を投げた場合、apply は一切呼ばれない(fail-closed)。
 * @param {{ query: (text: string, values?: any[]) => Promise<any> }} client
 * @param {{ w: ReturnType<typeof computeWindow>, newcomerDays: number, apply: boolean }} opts
 */
export async function runWeeklyRankings(client, { w, newcomerDays, apply }) {
  const { text: computeText, values: computeValues } = buildComputeQuery(w, newcomerDays)
  const computeRes = await client.query(computeText, computeValues)
  const rows = computeRes.rows[0]?.result
  const list = Array.isArray(rows) ? rows : []

  let applyResult = null
  if (apply) {
    const { text: applyText, values: applyValues } = buildApplyQuery(w, newcomerDays)
    const applyRes = await client.query(applyText, applyValues)
    applyResult = applyRes.rows[0]?.result ?? null
  }
  return { rows: list, applyResult }
}
