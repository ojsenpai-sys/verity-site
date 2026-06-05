/**
 * DMM サイト表示用アフィリエイトリンク生成ヘルパー。
 *
 * 環境変数:
 *   DMM_SITE_AFFILIATE_ID        — サーバー側（Server Components 等）
 *   NEXT_PUBLIC_DMM_SITE_AFFILIATE_ID — クライアント側（Client Components）
 *
 * ※ AFFILIATE_ID は DMM API 呼び出し専用（dmm.ts）。リンク生成には使わない。
 */

function affiliateId(): string {
  return (
    (typeof process !== 'undefined' && process.env?.DMM_SITE_AFFILIATE_ID) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DMM_SITE_AFFILIATE_ID) ||
    ''
  )
}

/**
 * DMM Japan（dmm.co.jp / fanza.co.jp）の URL を国際版 fanza.com に変換。
 * al.* アフィリエイトリダイレクト URL 内の lurl パラメータも変換対象。
 */
function toGlobalUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === 'al.dmm.co.jp' || u.hostname === 'al.fanza.co.jp') {
      const lurl = u.searchParams.get('lurl')
      if (lurl) {
        try {
          const inner = new URL(decodeURIComponent(lurl))
          if (inner.hostname.endsWith('.dmm.co.jp') || inner.hostname.endsWith('.fanza.co.jp')) {
            inner.hostname = 'www.fanza.com'
            u.searchParams.set('lurl', inner.toString())
          }
        } catch { /* inner URL が解析不能な場合はそのまま */ }
      }
      return u.toString()
    }
    if (u.hostname.endsWith('.dmm.co.jp') || u.hostname.endsWith('.fanza.co.jp')) {
      u.hostname = 'www.fanza.com'
      return u.toString()
    }
    return url
  } catch {
    return url
  }
}

/**
 * 国内ユーザーは通常の DMM/FANZA アフィリエイトリンクを、
 * 海外ユーザーは fanza.com（グローバル版）に変換した上でアフィリエイトリンクを返す。
 */
export function withAffiliateForRegion(
  url: string | null | undefined,
  isOverseas: boolean,
): string | null {
  if (!url) return null
  return withAffiliate(isOverseas ? toGlobalUrl(url) : url)
}

export function withAffiliate(url: string | null | undefined): string | null {
  if (!url) return null
  const af = affiliateId()
  if (!af) return url
  try {
    const u = new URL(url)
    // すでにアフィリエイトリダイレクト経由 → af_id を常に現在の ID で上書き（旧IDを引き継がない）
    // DMM API は al.fanza.co.jp を返すことがあるため両方対応
    if (u.hostname === 'al.dmm.co.jp' || u.hostname === 'al.fanza.co.jp') {
      u.searchParams.set('af_id', af)
      if (!u.searchParams.has('ch')) u.searchParams.set('ch', 'toolbar')
      return u.toString()
    }
    // DMM/FANZA 直リンク → アフィリエイトリダイレクト経由に変換
    if (u.hostname.endsWith('dmm.co.jp') || u.hostname.endsWith('dmm.com') || u.hostname.endsWith('fanza.co.jp')) {
      return `https://al.dmm.co.jp/?lurl=${encodeURIComponent(url)}&af_id=${encodeURIComponent(af)}&ch=toolbar`
    }
    return url
  } catch {
    return url
  }
}
