import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const ADMIN_TO       = process.env.ADMIN_EMAIL    ?? 'ojsenpai@gmail.com'
// onboarding@resend.dev はアカウントオーナー宛てにのみ届くテスト用 From。
// verity-official.com ドメインを Resend で検証後、CONTACT_FROM_EMAIL を
// "VERITY <noreply@verity-official.com>" に差し替えることで本番 From に昇格できる。
const FROM_ADDR      = process.env.CONTACT_FROM_EMAIL ?? 'onboarding@resend.dev'

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, email, subject, message } = (body ?? {}) as Record<string, string>

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: 'お名前・メールアドレス・お問い合わせ内容は必須です' },
      { status: 400 },
    )
  }

  if (!RESEND_API_KEY) {
    console.error('[contact] RESEND_API_KEY is not set')
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 503 })
  }

  const mailSubject = `[VERITY お問い合わせ] ${subject?.trim() || 'VERITYへのお問い合わせ'}`
  const safeN = esc(name)
  const safeE = esc(email)
  const safeS = esc(subject || '（件名なし）')
  const safeM = esc(message).replace(/\n/g, '<br/>')

  const htmlBody = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#e20074;border-bottom:2px solid #e20074;padding-bottom:8px">
        VERITY お問い合わせ通知
      </h2>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="padding:8px;font-weight:bold;width:140px;color:#666">お名前</td>
            <td style="padding:8px">${safeN}</td></tr>
        <tr style="background:#f9f9f9">
            <td style="padding:8px;font-weight:bold;color:#666">メールアドレス</td>
            <td style="padding:8px"><a href="mailto:${safeE}">${safeE}</a></td></tr>
        <tr><td style="padding:8px;font-weight:bold;color:#666">件名</td>
            <td style="padding:8px">${safeS}</td></tr>
      </table>
      <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-radius:8px">
        <p style="font-weight:bold;color:#666;margin:0 0 8px">お問い合わせ内容:</p>
        <p style="margin:0">${safeM}</p>
      </div>
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
      <p style="font-size:12px;color:#999">
        このメールは <a href="https://verity-official.com">VERITY</a> の
        お問い合わせフォームから自動送信されました。<br/>
        返信は <a href="mailto:${safeE}">${safeE}</a> 宛に行ってください。
      </p>
    </div>
  `

  const textBody = [
    'VERITYへのお問い合わせ',
    '',
    `お名前: ${name}`,
    `メールアドレス: ${email}`,
    `件名: ${subject || '（件名なし）'}`,
    '',
    'お問い合わせ内容:',
    message,
  ].join('\n')

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     FROM_ADDR,
        to:       [ADMIN_TO],
        reply_to: email,
        subject:  mailSubject,
        html:     htmlBody,
        text:     textBody,
      }),
    })
  } catch (fetchErr) {
    console.error('[contact] fetch to Resend failed:', fetchErr)
    return NextResponse.json(
      { error: 'メール送信に失敗しました。しばらくしてから再度お試しください。' },
      { status: 500 },
    )
  }

  if (!res.ok) {
    const raw = await res.text()
    console.error('[contact] Resend API error:', res.status, raw)
    return NextResponse.json(
      { error: 'メール送信に失敗しました。しばらくしてから再度お試しください。' },
      { status: 500 },
    )
  }

  const json = await res.json() as { id?: string }
  console.log('[contact] sent OK — id:', json.id, 'to:', ADMIN_TO)
  return NextResponse.json({ ok: true })
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
