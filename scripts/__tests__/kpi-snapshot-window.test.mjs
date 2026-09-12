// scripts/__tests__/kpi-snapshot-window.test.mjs
// 実行: node --test scripts/__tests__/kpi-snapshot-window.test.mjs
//
// migration 056 (kpi_daily_snapshot 部分日修正 + Phase2ハードニング) の
// as_of/snapshot_date/窓算術を scripts/lib/kpi-snapshot-window.mjs 経由で検証する
// (DB接続なし・pure JS)。加えて、実際にDBへ接続してplpgsqlを実行することは
// ローカル環境にPostgres/Dockerが無いため不可能なため、056のSQLテキストに対する
// 静的検証(CASE8系)でハードニング内容の存在を保証する。
//
// 【検証範囲の明示】
//   検証済み: 日付境界算術(JST/UTC/月/年境界)の正しさ(pure JS mirror)、
//             056のSQLテキストが意図した構造(UPSERT/generate_series/fail-closed/
//             jst_midnight_minus_days経由/30日下限/自動seed削除)を含むこと。
//   未検証:   実際にPostgres上でplpgsqlとして構文エラーなく実行できること、
//             INSERT/UPDATE/RAISE EXCEPTIONが実行時に意図通り動作すること
//             （ローカルにPostgres/Dockerが無く、production DBへの接続・実行は
//             禁止されているため）。本番適用前に、実際のSupabase環境
//             （またはステージング）でのdry-run実行を推奨する。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  jstDateString,
  jstMidnightMsOf,
  asOfMs,
  snapshotDateFor,
  windowStartMs,
  snapshotWindows,
} from '../lib/kpi-snapshot-window.mjs'

const at = (iso) => new Date(iso).getTime()

// ── CASE 1: execution=2026-09-12 05:00 JST → snapshot_date=2026-09-11 ─────────
test('CASE1: 2026-09-12 05:00 JST実行のsnapshot_dateは前日2026-09-11になる', () => {
  assert.equal(snapshotDateFor(at('2026-09-12T05:00:00+09:00')), '2026-09-11')
})

// ── CASE 2: DAU window = 09-11 00:00〜09-12 00:00 JST ─────────────────────────
test('CASE2: DAU窓(N=1)は対象日の00:00〜翌日00:00 JSTちょうど24時間になる', () => {
  const executedAt = at('2026-09-12T05:00:00+09:00')
  const w = snapshotWindows(executedAt)
  assert.equal(w.dau.fromMs, at('2026-09-11T00:00:00+09:00'))
  assert.equal(w.dau.toMs, at('2026-09-12T00:00:00+09:00'))
  assert.equal(w.dau.toMs - w.dau.fromMs, 24 * 3600_000)
})

// ── CASE 3: WAU = 直近7完全JST暦日 ────────────────────────────────────────────
test('CASE3: WAU窓(N=7)は2026-09-05 00:00〜2026-09-12 00:00 JST(ちょうど7日)になる', () => {
  const executedAt = at('2026-09-12T05:00:00+09:00')
  const w = snapshotWindows(executedAt)
  assert.equal(w.wau.fromMs, at('2026-09-05T00:00:00+09:00'))
  assert.equal(w.wau.toMs, at('2026-09-12T00:00:00+09:00'))
  assert.equal(w.wau.toMs - w.wau.fromMs, 7 * 24 * 3600_000)
})

// ── CASE 4: MAU = 直近30完全JST暦日 ───────────────────────────────────────────
test('CASE4: MAU窓(N=30)は2026-08-13 00:00〜2026-09-12 00:00 JST(ちょうど30日)になる', () => {
  const executedAt = at('2026-09-12T05:00:00+09:00')
  const w = snapshotWindows(executedAt)
  assert.equal(w.mau.fromMs, at('2026-08-13T00:00:00+09:00'))
  assert.equal(w.mau.toMs, at('2026-09-12T00:00:00+09:00'))
  assert.equal(w.mau.toMs - w.mau.fromMs, 30 * 24 * 3600_000)
})

// ── CASE 5: UTC/JST日跨ぎ境界（UTC日付とJST日付が異なる瞬間） ──────────────────
test('CASE5: UTC日付とJST日付が異なる瞬間でもJST日付を基準に判定する(UTC基準の誤りを検出)', () => {
  const executedAt = at('2026-03-01T00:30:00+09:00')
  assert.equal(jstDateString(executedAt), '2026-03-01')
  assert.notEqual(new Date(executedAt).toISOString().slice(0, 10), jstDateString(executedAt))
  assert.equal(snapshotDateFor(executedAt), '2026-02-28')
})

// ── CASE 6: 月境界（2026年2月=28日・非閏年） ──────────────────────────────────
test('CASE6: 月境界(2026-03-01 05:00 JST実行)のsnapshot_dateは2026-02-28になる', () => {
  assert.equal(snapshotDateFor(at('2026-03-01T05:00:00+09:00')), '2026-02-28')
})

test('CASE6b: 閏年境界(2028-03-01 05:00 JST実行)のsnapshot_dateは2028-02-29になる', () => {
  assert.equal(snapshotDateFor(at('2028-03-01T05:00:00+09:00')), '2028-02-29')
})

// ── CASE 7: 年境界 ────────────────────────────────────────────────────────────
test('CASE7: 年境界(2026-01-01 05:00 JST実行)のsnapshot_dateは2025-12-31になる', () => {
  assert.equal(snapshotDateFor(at('2026-01-01T05:00:00+09:00')), '2025-12-31')
})

// ── asOfMs / jstMidnightMsOf 単体の整合性 ─────────────────────────────────────
test('asOfMsはjstMidnightMsOfと一致する(v_as_ofの定義そのもの)', () => {
  const executedAt = at('2026-09-12T05:00:00+09:00')
  assert.equal(asOfMs(executedAt), jstMidnightMsOf(executedAt))
  assert.equal(asOfMs(executedAt), at('2026-09-12T00:00:00+09:00'))
})

test('windowStartMsはasOfMsからN日分を引いた値になる', () => {
  const executedAt = at('2026-09-12T05:00:00+09:00')
  assert.equal(asOfMs(executedAt) - windowStartMs(executedAt, 1), 1 * 24 * 3600_000)
  assert.equal(asOfMs(executedAt) - windowStartMs(executedAt, 7), 7 * 24 * 3600_000)
  assert.equal(asOfMs(executedAt) - windowStartMs(executedAt, 30), 30 * 24 * 3600_000)
})

// ── 056 SQLテキストに対する静的検証（DB接続なし・plpgsql実行検証は範囲外） ──────
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '056_kpi_snapshot_complete_day.sql'),
  'utf8',
)

test('CASE8: 056はリアルタイム関数(get_audience_counts_v2/v3, human_v3_sessions, is_active_event, is_auto_event)を再定義しない', () => {
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_audience_counts\(\)/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_audience_counts_v2\(\)/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_audience_counts_v3\(\)/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.human_v3_sessions\(/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.is_active_event\(/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.is_auto_event\(/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_human_engagement_counts\(/)
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_human_engagement_counts_v3\(/)
})

test('CASE8b: 056は新設のas_of版3関数・ヘルパー・backfill関数・更新後snapshot_daily_kpi()を定義する', () => {
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.jst_midnight_minus_days\(p_as_of timestamptz, p_days int\)/)
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_audience_counts_at\(p_as_of timestamptz\)/)
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_audience_counts_v2_at\(p_as_of timestamptz\)/)
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.get_audience_counts_v3_at\(p_as_of timestamptz\)/)
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day\(p_from date, p_to date\)/)
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.snapshot_daily_kpi\(\)/)
})

test('CASE8c: get_audience_counts_v3_atはhuman_v3_sessions()を素通しで呼ぶだけで独自の判定条件を書かない', () => {
  const fnMatch = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.get_audience_counts_v3_at[\s\S]*?\$\$;/,
  )
  assert.ok(fnMatch, 'get_audience_counts_v3_at の定義が見つからない')
  const body = fnMatch[0]
  assert.match(body, /human_v3_sessions\(/)
  assert.doesNotMatch(body, /is_bot_ua/)
  assert.doesNotMatch(body, /is_active_event/)
  assert.doesNotMatch(body, /page_path/)
})

test('CASE8d: 056は過去migrationファイルを書き換えず新規ファイルのみを追加する(冪等パターン踏襲の確認)', () => {
  assert.doesNotMatch(migrationSql, /DROP\s+(FUNCTION|TABLE|VIEW)/i)
})

// ── Phase2ハードニング①: TIMEZONE統一（timestamptz-interval減算を排除） ───────
test('CASE9: *_at()3関数の窓境界はjst_midnight_minus_days()経由で計算され、p_as_ofへの直接interval減算を使わない', () => {
  const fnNames = ['get_audience_counts_at', 'get_audience_counts_v2_at', 'get_audience_counts_v3_at']
  for (const name of fnNames) {
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?\\$\\$;`)
    const body = migrationSql.match(re)?.[0]
    assert.ok(body, `${name} の定義が見つからない`)
    assert.match(body, /jst_midnight_minus_days\(p_as_of,\s*1\)/, `${name}: DAU窓がjst_midnight_minus_daysを使っていない`)
    assert.match(body, /jst_midnight_minus_days\(p_as_of,\s*7\)/, `${name}: WAU窓がjst_midnight_minus_daysを使っていない`)
    assert.match(body, /jst_midnight_minus_days\(p_as_of,\s*30\)/, `${name}: MAU窓がjst_midnight_minus_daysを使っていない`)
    assert.doesNotMatch(body, /p_as_of\s*-\s*interval/, `${name}: p_as_ofへの直接interval減算が残っている`)
  }
})

test('CASE9b: jst_midnight_minus_days自体は029/033/044と同じ「date型整数減算→単一AT TIME ZONE変換」方式である', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.jst_midnight_minus_days[\s\S]*?\$\$;/,
  )?.[0]
  assert.ok(body, 'jst_midnight_minus_days の定義が見つからない')
  assert.match(body, /::date - p_days/)
  assert.match(body, /::timestamp AT TIME ZONE 'Asia\/Tokyo'/)
  assert.doesNotMatch(body, /interval/)
})

// ── Phase2ハードニング②: v2_atの30日下限（無下限フルスキャンの解消） ──────────
test('CASE10: get_audience_counts_v2_atのev CTEは30日より古いeventを対象外にする明示的な下限を持つ', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.get_audience_counts_v2_at[\s\S]*?\$\$;/,
  )?.[0]
  assert.ok(body, 'get_audience_counts_v2_at の定義が見つからない')
  const evCte = body.match(/WITH ev AS \([\s\S]*?\)\s*SELECT/)?.[0]
  assert.ok(evCte, 'ev CTEが見つからない')
  assert.match(evCte, /jst_midnight_minus_days\(p_as_of,\s*30\)/, 'ev CTEに30日下限が無い(無下限フルスキャンのまま)')
})

// ── Phase3: Historical Backfill Completeness Audit（OPTION B確定・欠測行は作らない） ──
// 監査の結論: members_total/members_active/preference_profilesの3列が過去再現
// 不可能なため「完全な行」を欠測日に新規生成できない。よってbackfillは
// 既存行のAudience列だけを是正するUPDATE専用に確定し、INSERT/UPSERT/generate_series
// は使わない（=NULLだらけの不完全な行を作る余地を構造的に排除する）。
test('CASE11: backfillはUPDATE専用であり、INSERT/UPSERT/generate_seriesを一切使わない(NULLだらけの不完全な行を作らない)', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  // コメント行(-- で始まる行。「generate_seriesは使わない」という説明コメント自体を
  // 誤検出しないよう、実行文の行だけに絞ってから判定する)
  const executableBody = body
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  assert.doesNotMatch(executableBody, /INSERT INTO/i, 'INSERTが残っている＝欠測日に不完全な行を新規生成できてしまう')
  assert.doesNotMatch(executableBody, /ON CONFLICT/i, 'ON CONFLICT(UPSERT)が残っている')
  assert.doesNotMatch(executableBody, /generate_series/i, 'generate_seriesが残っている＝存在しない日付を人為的に生成できてしまう')
  assert.match(executableBody, /UPDATE public\.kpi_daily_snapshot k SET/, 'UPDATE文が見つからない')
})

test('CASE12: backfillの対象日列挙はkpi_daily_snapshotの既存行のみ(行が存在しない日は自動的にno-op)', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  assert.match(
    body,
    /FOR d IN\s*\n\s*SELECT snapshot_date FROM public\.kpi_daily_snapshot\s*\n\s*WHERE snapshot_date >= p_from AND snapshot_date <= p_to/,
    '既存行を列挙するFOR文が見つからない、または条件が変わっている',
  )
})

test('CASE12b: range外(p_from〜p_to外)の日付はWHERE句のsnapshot_date範囲条件で構造的に対象外になる', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  // WHERE句がp_from/p_to両方で絞り込んでいること(範囲外の既存正常日に触れない)
  assert.match(body, /WHERE snapshot_date >= p_from AND snapshot_date <= p_to/)
  // UPDATE文自体もWHERE k.snapshot_date = d で1行のみを対象にする(ループ変数dの外の行に波及しない)
  assert.match(body, /WHERE k\.snapshot_date = d;/)
})

test('CASE12c: 2026-09-06は意図的にbackfill対象外とし、欠測日のまま維持する方針がコメントで明示されている', () => {
  assert.match(migrationSql, /2026-09-06/)
  assert.match(migrationSql, /意図的に(復元しない|no-opのまま据え置く)/)
})

test('CASE13: backfillはp_from/p_toがNULLの場合にRAISE EXCEPTIONするfail-closed設計になっている(デフォルト値も無い)', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  assert.match(body, /p_from date, p_to date\)/, 'p_from/p_toにDEFAULT NULLが残っている(全履歴誤爆の温床)')
  assert.doesNotMatch(body, /DEFAULT NULL/)
  assert.match(body, /IF p_from IS NULL OR p_to IS NULL THEN\s*\n\s*RAISE EXCEPTION/)
})

test('CASE13b: backfillはp_from > p_toの場合もRAISE EXCEPTIONする', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  assert.match(body, /IF p_from > p_to THEN\s*\n\s*RAISE EXCEPTION/)
})

test('CASE14: backfillのUPDATEはDAU/WAU/MAU(raw/v2/v3)列のみを扱い、Human Engagement/累計列やsnapshot_date自体を更新しない', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  const updateSet = body.match(/UPDATE public\.kpi_daily_snapshot k SET([\s\S]*?)WHERE k\.snapshot_date = d;/)?.[1]
  assert.ok(updateSet, 'UPDATE ... SET句が見つからない')
  assert.doesNotMatch(updateSet, /human_work_views|human_v3_work_views|members_total|page_view_total|user_events_total|preference_profiles/)
  assert.doesNotMatch(updateSet, /snapshot_date\s*=/)
  assert.match(updateSet, /audience_raw_dau/)
  assert.match(updateSet, /audience_v2_dau/)
  assert.match(updateSet, /audience_v3_dau/)
})

test('CASE14b: backfillは行が存在しない日に「Audience列だけ入りその他がNULLの不完全な行」を作れない構造になっている(INSERT自体が存在しないため)', () => {
  const body = migrationSql.match(
    /CREATE OR REPLACE FUNCTION public\.backfill_kpi_snapshot_complete_day[\s\S]*?\nGRANT/,
  )?.[0]
  assert.ok(body, 'backfill_kpi_snapshot_complete_day の定義が見つからない')
  // UPDATE専用(CASE11で確認済み)である以上、"missing row + 完全復元不可 → INSERTしない"
  // と "missing row + 完全復元可能ならcomplete INSERT" のどちらの分岐も現状は実装されていない
  // (完全復元可能な列が無いと判明したため、後者の分岐自体を意図的に作らなかった=OPTION B)。
  assert.doesNotMatch(body, /INSERT/i)
})

// ── Phase2ハードニング④: APPLY-TIME SEEDの分離（migration本体からの自動実行削除） ──
test('CASE15: 056は末尾で snapshot_daily_kpi() を自動実行しない(migration本体からseedを分離)', () => {
  // ファイル全体を見て、コメント外の実行文としての `SELECT public.snapshot_daily_kpi();` が
  // 存在しないことを確認する。コメント行(`--`で始まる行)内の言及は許容する。
  const executableLines = migrationSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  assert.doesNotMatch(executableLines, /^\s*SELECT public\.snapshot_daily_kpi\(\);\s*$/m)
})

// ── 未検証事項の明示（このテストファイルの限界を機械的にも記録する） ───────────
test('LIMITATION: 本テストスイートはSQL/plpgsqlの実DB実行を検証しない(ローカルPostgres/Docker不在・production write禁止のため静的テキスト検証のみ)', () => {
  // このtestは常にpassする「注記の記録」目的。実行検証が必要な場合は
  // ステージング環境またはローカルPostgresでのdry-run適用を別途行うこと。
  assert.ok(true)
})
