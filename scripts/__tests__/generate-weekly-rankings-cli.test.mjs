// scripts/__tests__/generate-weekly-rankings-cli.test.mjs
// 実行: node --test scripts/__tests__/generate-weekly-rankings-cli.test.mjs
//
// generate-weekly-rankings.mjs をサブプロセスとして実際に起動し、
// 「本番DBには一切接続しない」2つの fail-closed 経路を検証する:
//   1. WEEKLY_RANKINGS_DATABASE_URL 未設定 → exit code 2（DB接続を試みる前に中断）
//   2. 到達不能ホスト（DNS解決失敗）→ exit code 1、かつ接続文字列/パスワードがログへ一切出力されない
// cwd を空の一時ディレクトリにすることで、実開発機の .env.local / ecosystem.config.js を
// 誤って読み込ませない（フォールバック実装のテスト漏れを防ぐ）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(__dirname, '..', 'generate-weekly-rankings.mjs')

function runCli(env, { timeout = 15_000 } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'wr3-cli-test-'))
  try {
    const result = spawnSync(process.execPath, [SCRIPT, '--week=2026-08-17'], {
      cwd,
      env: { ...env, PATH: process.env.PATH },
      encoding: 'utf8',
      timeout,
    })
    return result
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

test('CLI: WEEKLY_RANKINGS_DATABASE_URL 未設定時はDB接続を試みず exit code 2 で中断する(fail-closed)', () => {
  const result = runCli({})
  assert.equal(result.status, 2)
  assert.match(result.stderr, /WEEKLY_RANKINGS_DATABASE_URL/)
})

test('CLI: 到達不能ホストへの接続失敗時は exit code 非0、かつ接続文字列/パスワードをログへ出力しない', () => {
  const FAKE_SECRET = 'S3cr3t_should_never_appear_in_logs'
  const fakeUrl = `postgresql://verity_weekly_rankings:${FAKE_SECRET}@wr3-nonexistent-host.invalid:5432/postgres`
  const result = runCli({ WEEKLY_RANKINGS_DATABASE_URL: fakeUrl })
  assert.notEqual(result.status, 0)
  // ホスト名自体はDNSエラーメッセージ("getaddrinfo ENOTFOUND ...")に自然に含まれ得るため
  // 機密ではない。検証対象はパスワード(FAKE_SECRET)のみ。
  const combined = `${result.stdout}\n${result.stderr}`
  assert.doesNotMatch(combined, new RegExp(FAKE_SECRET))
})
