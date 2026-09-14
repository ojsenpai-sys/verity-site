#!/usr/bin/env node
// scripts/check-build-env.mjs
// ═════════════════════════════════════════════════════════════════════════════
// production incident再発防止(2026-09-14): deploy用git worktreeに.env.localが
// 存在しないままnpm run buildが実行され、NEXT_PUBLIC_SUPABASE_URL/ANON_KEYが
// クライアントバンドルへ空文字で焼き込まれた。next buildはこの状態でも
// exit 0で正常終了するため、deploy.shのset -eでは検知できなかった。
//
// このスクリプトは、Next.js自身が使うのと同じ @next/env の loadEnvConfig() で
// build時に解決されるenvを読み込み、クライアントバンドルに焼き込まれる
// 必須変数が未定義・空文字・whitespaceのみでないことを確認する。
// deploy.shからnpm run buildより前に呼び出し、失敗時はexit 1でbuild/SSH/VPS
// 転送のいずれにも進ませない。
//
// 値は一切stdout/stderrへ出力しない(変数名とOK/MISSINGのみ)。
//
// 使い方: node scripts/check-build-env.mjs
// ═════════════════════════════════════════════════════════════════════════════
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

// クライアントバンドルに焼き込まれ、かつ安全なfallbackを持たない変数のみを対象にする。
// NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_BRAND_ID / NEXT_PUBLIC_GA_TRACKING_ID 等は
// コード側に `?? default` のfallbackがあり未設定でもクラッシュしないため対象外。
const REQUIRED_BUILD_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']

// loadEnvConfig 自身のログ出力(読み込んだファイルパス等)を抑止する。
// パス自体は秘密ではないが、このスクリプトの出力はOK/MISSINGのみに統一するため。
const silentLog = { info: () => {}, error: () => {} }

function isNonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function main() {
  // dev=false: `next build`(production build)と同じ優先順位で
  // .env.production.local / .env.local / .env.production / .env を解決する。
  const { combinedEnv } = loadEnvConfig(process.cwd(), false, silentLog)

  let allOk = true
  for (const key of REQUIRED_BUILD_ENV) {
    const ok = isNonBlank(combinedEnv[key])
    console.log(`[preflight] ${key}: ${ok ? 'OK' : 'MISSING'}`)
    if (!ok) allOk = false
  }

  if (!allOk) {
    console.error('')
    console.error('ERROR: Required build environment is incomplete.')
    console.error('Deployment aborted before build.')
    process.exit(1)
  }

  console.log('[preflight] Required build environment: PASS')
  process.exit(0)
}

main()
