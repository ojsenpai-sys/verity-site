// Sitemap Route Handler 共通の HTTP 応答ヘルパー。

/** 公開ページの canonical と同じ基底 URL（各 page.tsx の BASE と同一定義）。 */
export const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

/** XML を返す（CDN/ブラウザ向けの短い max-age。DB 負荷は data 層の unstable_cache が担う）。 */
export function xmlResponse(xml: string, maxAgeSec = 3600): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAgeSec}`,
    },
  })
}

/**
 * データ取得失敗時は空/部分 sitemap を 200 で返さず 503 にする（クローラーは後で再取得する）。
 * no-store で失敗応答をキャッシュさせない。
 */
export function sitemapUnavailable(label: string, err: unknown): Response {
  console.error(`[sitemap:${label}] unavailable:`, err instanceof Error ? err.message : String(err))
  return new Response('Sitemap temporarily unavailable\n', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '600',
    },
  })
}

export function sitemapNotFound(): Response {
  return new Response('Not Found\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
