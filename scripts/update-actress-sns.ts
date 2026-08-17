#!/usr/bin/env tsx
/**
 * 女優 X(Twitter) スクリーンネーム登録スクリプト
 *
 * Usage:
 *   npx tsx scripts/update-actress-sns.ts <actress_external_id> <x_screen_name>
 *
 * Example:
 *   npx tsx scripts/update-actress-sns.ts dmm-actress-1234567 someactress_jp
 *
 * 処理内容:
 *   actresses.twitter_screen_name を DB に保存（管理画面等の公式Xリンク表示に使用）
 */

import { createClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'

// Load env
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL          = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const [externalId, screenName] = process.argv.slice(2)

  if (!externalId || !screenName) {
    console.error('Usage: npx tsx scripts/update-actress-sns.ts <actress_external_id> <x_screen_name>')
    console.error('Example: npx tsx scripts/update-actress-sns.ts dmm-actress-1234567 someactress_jp')
    process.exit(1)
  }

  // ── 1. DB 更新 ────────────────────────────────────────────────────────────
  const { data: actress, error } = await supabase
    .from('actresses')
    .update({ twitter_screen_name: screenName })
    .eq('external_id', externalId)
    .select('id, name, external_id')
    .single()

  if (error || !actress) {
    console.error('❌ DB 更新失敗:', error?.message ?? '女優が見つかりません')
    console.error('   external_id を確認してください:', externalId)
    process.exit(1)
  }

  console.log(`✓ DB 更新: ${actress.name} (${externalId}) → @${screenName}`)
  console.log('\n完了しました。')
}

main().catch(e => { console.error(e); process.exit(1) })
