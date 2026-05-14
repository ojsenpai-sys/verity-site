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
