// scripts/lib/kpi-snapshot-window.mjs
// migration 056 (snapshot_daily_kpi) の as_of / snapshot_date / N日窓の日付算術を
// pure JSで再現したもの。実際の計算はPostgres(plpgsql/SQL)側で行われ、DBには
// 接続しないため、本ファイルはSQLロジックの「仕様の鏡」として日付境界の正しさを
// node:testで検証する目的にのみ使う（audienceV3FromSnapshot.mjsと同じ位置づけ）。
//
// SQL側の対応関係:
//   v_as_of         = jstMidnightMsOf(実行時刻)   -- 056の v_as_of
//   v_snapshot_date = snapshotDateFor(実行時刻)   -- 056の v_snapshot_date
//   各窓の開始       = windowStartMs(実行時刻, N)  -- get_audience_counts*_at の `p_as_of - interval 'N days'`
//   各窓の終了       = asOfMs(実行時刻)            -- get_audience_counts*_at の `p_as_of`
//
// 056のSQLを変更する場合は、この算術と齟齬が出ないよう本ファイルも合わせて更新すること。

const JST_OFFSET_MS = 9 * 3600_000
const DAY_MS = 86_400_000

const pad2 = (n) => String(n).padStart(2, '0')

/** 与えられた瞬間(epoch ms)が属するJST暦日の "YYYY-MM-DD" 文字列。 */
export function jstDateString(atMs) {
  const j = new Date(atMs + JST_OFFSET_MS)
  return `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`
}

/** 与えられた瞬間が属するJST暦日の00:00に対応するUTC epoch ms。 */
export function jstMidnightMsOf(atMs) {
  const j = new Date(atMs + JST_OFFSET_MS)
  const utcMidnightJst = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate())
  return utcMidnightJst - JST_OFFSET_MS
}

/**
 * snapshot_daily_kpi() の v_as_of: 実行時刻が属するJST暦日の00:00
 * （＝「直前に完了した対象日」の終了時点・次のconfirmed行の上限）。
 * @param {number} executedAtMs 実行時刻(epoch ms)
 */
export function asOfMs(executedAtMs) {
  return jstMidnightMsOf(executedAtMs)
}

/**
 * snapshot_daily_kpi() が保存する snapshot_date（= as_ofの前日 = 対象日）を
 * "YYYY-MM-DD"(JST) で返す。
 * @param {number} executedAtMs 実行時刻(epoch ms)
 */
export function snapshotDateFor(executedAtMs) {
  return jstDateString(asOfMs(executedAtMs) - 1) // as_ofの1ms前は必ず対象日(前日)側
}

/**
 * get_audience_counts*_at(p_as_of) が使う N日窓の開始時刻(epoch ms)。
 * 窓は半開区間 [windowStartMs, asOfMs) で、Nちょうど完全日分になる。
 * @param {number} executedAtMs 実行時刻(epoch ms)
 * @param {number} days 窓の日数（DAU=1, WAU=7, MAU=30）
 */
export function windowStartMs(executedAtMs, days) {
  return asOfMs(executedAtMs) - days * DAY_MS
}

/**
 * DAU/WAU/MAU 3窓分の [from, to) をまとめて返す（テスト・呼び出し側の可読性用）。
 * @param {number} executedAtMs 実行時刻(epoch ms)
 */
export function snapshotWindows(executedAtMs) {
  const to = asOfMs(executedAtMs)
  return {
    snapshotDate: snapshotDateFor(executedAtMs),
    dau: { fromMs: windowStartMs(executedAtMs, 1), toMs: to },
    wau: { fromMs: windowStartMs(executedAtMs, 7), toMs: to },
    mau: { fromMs: windowStartMs(executedAtMs, 30), toMs: to },
  }
}
