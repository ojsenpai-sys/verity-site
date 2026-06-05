/**
 * Supabase DB直接更新テスト（Next.jsサーバー不要）
 * 実行: node --env-file=.env.local scripts/test-db-update.mjs
 */

import { createClient } from '@supabase/supabase-js'

// SSL検証をスキップ（ローカルSSL証明書問題の回避）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROFILE_ID   = '6f4231fe-c539-467e-b69b-419bad605858'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ 環境変数が未設定です（.env.local を確認してください）')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30日後

console.log('=== Supabase DB 直接更新テスト ===')
console.log(`profile_id : ${PROFILE_ID}`)
console.log(`expires_at : ${expiresAt.toISOString()}`)
console.log('')

// ── BEFORE: 現在の値を確認 ────────────────────────────────────────────
const { data: before, error: readErr } = await supabase
  .from('profiles')
  .select('is_subscribed, subscription_expires_at, purchased_slots')
  .eq('user_id', PROFILE_ID)
  .maybeSingle()

if (readErr) {
  console.error('❌ SELECT エラー:', readErr.message)
  process.exit(1)
}
console.log('BEFORE:', before)

// ── UPDATE: is_subscribed = true ──────────────────────────────────────
const { error: updateErr } = await supabase
  .from('profiles')
  .update({
    is_subscribed:           true,
    subscription_expires_at: expiresAt.toISOString(),
  })
  .eq('user_id', PROFILE_ID)

if (updateErr) {
  console.error('❌ UPDATE エラー:', updateErr.message)
  process.exit(1)
}

// ── AFTER: 更新後の値を確認 ───────────────────────────────────────────
const { data: after, error: verifyErr } = await supabase
  .from('profiles')
  .select('is_subscribed, subscription_expires_at, purchased_slots')
  .eq('user_id', PROFILE_ID)
  .maybeSingle()

if (verifyErr) {
  console.error('❌ 検証SELECT エラー:', verifyErr.message)
  process.exit(1)
}

console.log('AFTER :', after)
console.log('')

if (after?.is_subscribed === true) {
  console.log('✅ 成功！ is_subscribed = true に更新されました')
  console.log(`   subscription_expires_at = ${after.subscription_expires_at}`)
} else {
  console.log('❌ 更新が反映されていません')
  process.exit(1)
}
