#!/usr/bin/env tsx
/**
 * SNS スクリーンネーム登録スクリプト
 *
 * Usage:
 *   npx tsx scripts/update-actress-sns.ts <actress_external_id> <x_screen_name>
 *
 * Example:
 *   npx tsx scripts/update-actress-sns.ts dmm-actress-1234567 someactress_jp
 *
 * 処理内容:
 *   1. actresses.twitter_screen_name を DB に保存
 *   2. src/lib/socialFeedActresses.ts にエントリを追加（未登録の場合）
 *   3. /verity/api/revalidate-sns を叩いてフィード同期を即時キック
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
const SITE_URL              = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000'
const CRON_SECRET           = process.env.CRON_SECRET ?? ''

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

  // ── 2. socialFeedActresses.ts を更新 ─────────────────────────────────────
  const listPath = path.join(__dirname, '..', 'src', 'lib', 'socialFeedActresses.ts')
  const content  = fs.readFileSync(listPath, 'utf8')

  if (content.includes(`'${screenName}'`) || content.includes(`"${screenName}"`)) {
    console.log(`ℹ  @${screenName} は既にリストに含まれています`)
  } else {
    const date    = new Date().toISOString().split('T')[0]
    const entry   = `  { name: '${actress.name}',     screenName: '${screenName}'    },\n`
    const section = `  // ── 管理者追加（${date}） ─────────────────────────────────────────\n${entry}`
    const lastBracket = content.lastIndexOf(']')
    const updated = content.slice(0, lastBracket) + section + content.slice(lastBracket)
    fs.writeFileSync(listPath, updated)
    console.log(`✓ socialFeedActresses.ts に追加: ${actress.name}`)
    console.log(`  ⚠  ビルド & デプロイ (bash deploy.sh) を実行してください`)
  }

  // ── 3. SNS 同期をキック ───────────────────────────────────────────────────
  const syncUrl = `${SITE_URL}/verity/api/revalidate-sns`
  console.log(`→ 同期リクエスト: ${syncUrl}`)

  try {
    const res  = await fetch(syncUrl, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    const body = await res.json() as Record<string, unknown>
    if (res.ok) {
      console.log(`✓ 同期キック完了:`, body)
    } else {
      console.warn(`⚠  同期レスポンス ${res.status}:`, body)
    }
  } catch (e) {
    console.warn(`⚠  同期リクエスト失敗 (サーバー起動中か確認してください):`, (e as Error).message)
  }

  console.log('\n完了しました。')
}

main().catch(e => { console.error(e); process.exit(1) })
