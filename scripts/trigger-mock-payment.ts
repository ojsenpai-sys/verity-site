/**
 * ローカル開発用 Stripe Webhook モックテストスクリプト
 *
 * 用途: customer.subscription.created イベントを模倣し、
 *       profiles.is_subscribed = true になるか確認する
 *
 * 実行方法:
 *   npx ts-node scripts/trigger-mock-payment.ts
 *
 * 前提:
 *   - npm run dev が起動中（localhost:3000）
 *   - NODE_ENV=development
 */

const WEBHOOK_URL   = 'http://localhost:3000/api/webhooks/stripe'
const BYPASS_HEADER = 'verity-dev-2026'

// テスト対象ユーザー
const PROFILE_ID = '6f4231fe-c539-467e-b69b-419bad605858'

// 30日後をサブスク期限として設定
const periodEnd = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30

// customer.subscription.created のモックイベント
// ※ invoice.payment_succeeded は内部で stripe.subscriptions.retrieve() を呼ぶため
//   ダミーIDでは失敗する。subscription.created/updated はイベント直参照のため安全。
const mockEvent = {
  id:      'evt_test_mock_001',
  object:  'event',
  type:    'customer.subscription.created',
  created: Math.floor(Date.now() / 1000),
  livemode: false,
  data: {
    object: {
      id:       'sub_test_mock_001',
      object:   'subscription',
      status:   'active',
      customer: 'cus_test_mock_001',
      metadata: {
        profile_id: PROFILE_ID,
      },
      items: {
        data: [
          {
            id:                   'si_test_mock_001',
            object:               'subscription_item',
            current_period_end:   periodEnd,
            current_period_start: Math.floor(Date.now() / 1000),
          },
        ],
      },
    },
  },
}

async function main() {
  console.log('🚀 Stripe Webhook モックテスト開始')
  console.log(`   エンドポイント : ${WEBHOOK_URL}`)
  console.log(`   profile_id    : ${PROFILE_ID}`)
  console.log(`   イベント種別  : ${mockEvent.type}`)
  console.log(`   期限          : ${new Date(periodEnd * 1000).toISOString()}`)
  console.log('')

  let res: Response
  try {
    res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type':          'application/json',
        'x-stripe-test-bypass':  BYPASS_HEADER,
      },
      body: JSON.stringify(mockEvent),
    })
  } catch (err) {
    console.error('❌ 接続失敗 — npm run dev が起動しているか確認してください')
    console.error('   エラー:', err)
    process.exit(1)
  }

  const body = await res.json().catch(() => null)

  if (res.ok && body?.received === true) {
    console.log('✅ 成功！ Webhookから 200 OK を受信しました')
    console.log('   レスポンス:', JSON.stringify(body, null, 2))
    console.log('')
    console.log('次の確認手順:')
    console.log('  Supabase Dashboard → Table Editor → profiles')
    console.log(`  → user_id = ${PROFILE_ID} の行で`)
    console.log('    is_subscribed = true')
    console.log(`    subscription_expires_at = ${new Date(periodEnd * 1000).toISOString()}`)
    console.log('  になっていれば完全成功です 🎉')
  } else {
    console.error('❌ 失敗 — サーバーエラーが返りました')
    console.error(`   HTTP ステータス: ${res.status}`)
    console.error('   レスポンス:', JSON.stringify(body, null, 2))
    process.exit(1)
  }
}

main()
