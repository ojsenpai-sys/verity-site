/**
 * Google Search Console OAuth2 リフレッシュトークン取得スクリプト
 *
 * 【使い方】
 *   1. Google Cloud Console でクライアントIDを作成（下記参照）
 *   2. ターミナルで以下を実行:
 *
 *      GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com \
 *      GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxx \
 *      node scripts/get-gsc-token.mjs
 *
 *      ※ Windows PowerShell の場合:
 *      $env:GOOGLE_OAUTH_CLIENT_ID="xxx"; $env:GOOGLE_OAUTH_CLIENT_SECRET="xxx"; node scripts/get-gsc-token.mjs
 *
 *   3. ブラウザが開くので、Search Console のオーナーアカウントでログイン
 *   4. 表示された4行を .env.local に貼り付けて npm run dev を再起動
 *
 * 【Google Cloud Console での事前設定】
 *   1. https://console.cloud.google.com/ を開く
 *   2. 左メニュー「APIとサービス」→「有効なAPI」→「Google Search Console API」を有効化
 *   3. 左メニュー「認証情報」→「認証情報を作成」→「OAuth 2.0 クライアント ID」
 *   4. アプリケーションの種類: 「ウェブアプリケーション」を選択
 *   5. 承認済みリダイレクト URI に以下を追加:
 *        http://localhost:4000/callback
 *   6. 「作成」→ クライアントID と クライアントシークレット をコピー
 *   7. （初回のみ）OAuth 同意画面で「テストユーザー」に自分のGmailを追加
 */

import http  from 'node:http'
import https from 'node:https'
import { exec } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ── 設定 ──────────────────────────────────────────────────────────────────────

// .env.local から CLIENT_ID / CLIENT_SECRET を自動ロード (環境変数で渡されていない場合)
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  const text = readFileSync(envPath, 'utf-8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET
const PORT          = 4000
const REDIRECT_URI  = `http://localhost:${PORT}/callback`
const SCOPE         = 'https://www.googleapis.com/auth/webmasters.readonly'

// ── バリデーション ────────────────────────────────────────────────────────────

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ 環境変数が不足しています。以下のように実行してください:\n')
  console.error('  PowerShell:')
  console.error('    $env:GOOGLE_OAUTH_CLIENT_ID="xxx.apps.googleusercontent.com"')
  console.error('    $env:GOOGLE_OAUTH_CLIENT_SECRET="GOCSPX-xxx"')
  console.error('    node scripts/get-gsc-token.mjs\n')
  process.exit(1)
}

// ── OAuth URL 生成 ────────────────────────────────────────────────────────────

const params = new URLSearchParams({
  client_id:     CLIENT_ID,
  redirect_uri:  REDIRECT_URI,
  response_type: 'code',
  scope:         SCOPE,
  access_type:   'offline',   // refresh_token を得るために必須
  prompt:        'consent',   // 毎回同意画面を表示（refresh_token を確実に取得）
})
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

// ── ブラウザを開く ────────────────────────────────────────────────────────────

const openCmd = process.platform === 'win32'
  ? `start "" "${authUrl}"`
  : process.platform === 'darwin'
  ? `open "${authUrl}"`
  : `xdg-open "${authUrl}"`

exec(openCmd, (err) => {
  if (err) console.warn('ブラウザを自動で開けませんでした。URLを手動でコピーしてください。')
})

console.log('\n🌐 ブラウザを開いています...')
console.log('   自動で開かない場合は以下のURLをブラウザに貼り付けてください:\n')
console.log(authUrl)
console.log(`\n⏳ ポート ${PORT} でコールバック待機中...\n`)

// ── ローカルHTTPサーバーでコールバックを受信 ─────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) return

  const url   = new URL(req.url, `http://localhost:${PORT}`)
  const code  = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    reply(res, 400, `<h1 style="color:red">❌ 認証エラー: ${error}</h1>`)
    server.close()
    process.exit(1)
  }

  if (!code) return

  // 認証コードをトークンと交換
  const body = new URLSearchParams({
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code',
  }).toString()

  let tokens
  try {
    tokens = await postJson('https://oauth2.googleapis.com/token', body)
  } catch (e) {
    reply(res, 500, `<h1 style="color:red">❌ トークン取得失敗: ${e.message}</h1>`)
    server.close()
    return
  }

  if (!tokens.refresh_token) {
    reply(res, 400,
      `<h1 style="color:red">❌ refresh_token が取得できませんでした</h1>
       <p>このOAuth2クライアントで過去に認証済みの場合は、以下を試してください:</p>
       <ol>
         <li>Google アカウント設定 → セキュリティ → <a href="https://myaccount.google.com/permissions" target="_blank">アプリへのアクセス</a> でこのアプリのアクセスを削除</li>
         <li>スクリプトを再実行</li>
       </ol>`)
    server.close()
    return
  }

  const envBlock = [
    `GOOGLE_OAUTH_CLIENT_ID=${CLIENT_ID}`,
    `GOOGLE_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`,
    `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`,
    `GOOGLE_SC_SITE_URL=https://verity-official.com/`,
  ].join('\n')

  // ── .env.local を自動更新 (GOOGLE_OAUTH_REFRESH_TOKEN のみ差し替え / 不在なら追記) ─
  let autoUpdated = false
  try {
    if (existsSync(envPath)) {
      const cur = readFileSync(envPath, 'utf-8')
      const re  = /^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m
      const next = re.test(cur)
        ? cur.replace(re, `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`)
        : `${cur.replace(/\n*$/, '')}\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`
      writeFileSync(envPath, next, 'utf-8')
      autoUpdated = true
    }
  } catch (e) {
    console.warn(`[get-gsc-token] .env.local 自動更新に失敗: ${e.message}`)
  }

  reply(res, 200,
    `<!DOCTYPE html>
     <html><head><meta charset="utf-8"><title>認証成功</title></head>
     <body style="font-family:monospace;background:#0d1117;color:#58a6ff;padding:2rem">
       <h1 style="color:#3fb950">✅ 認証成功！</h1>
       ${autoUpdated
         ? '<p style="color:#3fb950"><strong>.env.local</strong> の GOOGLE_OAUTH_REFRESH_TOKEN を自動更新しました。</p>'
         : '<p style="color:#c9d1d9"><strong>.env.local</strong> に以下の4行を追加してください:</p>'}
       <pre style="background:#161b22;border:1px solid #30363d;padding:1.5rem;border-radius:6px;color:#e6edf3;line-height:1.8">${envBlock}</pre>
       <p style="color:#8b949e">このタブは閉じて構いません。ターミナルに戻って次の指示を待ってください。</p>
     </body></html>`)

  console.log('\n' + '═'.repeat(60))
  if (autoUpdated) {
    console.log('✅ 認証成功！.env.local は自動更新済みです。')
    console.log('   次は管理者に「SEO トークン取得完了」と伝えてください。')
  } else {
    console.log('✅ 認証成功！以下を .env.local に手動で反映してください:\n')
    console.log(envBlock)
  }
  console.log('═'.repeat(60) + '\n')

  server.close()
})

server.listen(PORT)

// ── ユーティリティ ────────────────────────────────────────────────────────────

function reply(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
}

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path:     u.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error(`JSON parse failed: ${data}`)) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}
