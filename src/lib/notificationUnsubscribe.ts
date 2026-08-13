import crypto from 'node:crypto'

// HMAC署名付きunsubscribe token検証（サーバー専用。ブラウザバンドルに含めないこと）。
// 生成側は scripts/lib/notification-mailer.mjs の buildUnsubscribeToken と
// 同一アルゴリズム(HMAC-SHA256, base64url payload.signature)。
// 双方が NOTIFICATION_UNSUBSCRIBE_SECRET を共有することでのみ整合する。

export type NotificationType = 'actress_new_release' | 'weekly_ranking' | 'all'

const VALID_TYPES: readonly NotificationType[] = ['actress_new_release', 'weekly_ranking', 'all']

type TokenPayload = { uid: string; t: NotificationType; exp: number }

export type VerifyResult =
  | { ok: true; userId: string; notificationType: NotificationType }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'invalid_type' }

function getSecret(): string {
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET
  if (!secret) throw new Error('NOTIFICATION_UNSUBSCRIBE_SECRET is not set')
  return secret
}

export function verifyUnsubscribeToken(token: string): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payloadB64, sig] = parts

  let secret: string
  try { secret = getSecret() } catch { return { ok: false, reason: 'malformed' } }

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'bad_signature' }
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!payload.uid || !payload.t || !payload.exp) return { ok: false, reason: 'malformed' }
  if (!VALID_TYPES.includes(payload.t)) return { ok: false, reason: 'invalid_type' }
  if (Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, reason: 'expired' }

  return { ok: true, userId: payload.uid, notificationType: payload.t }
}
