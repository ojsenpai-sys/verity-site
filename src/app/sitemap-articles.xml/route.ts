import type { NextRequest } from 'next/server'
import { articleUrl, buildUrlsetXml, parseArticleMonth } from '@/lib/sitemapCore.mjs'
import { getArticleMonthRows } from '@/lib/sitemapData'
import { SITE_BASE, sitemapNotFound, sitemapUnavailable, xmlResponse } from '@/lib/sitemapHttp'

// /sitemap-articles.xml?month=YYYY-MM — その JST 発売月の作品（released・active・non-mock）。
// month が形式不正・範囲外（2007-02 より前／未来月）・未指定なら 404（存在しない sitemap）。
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<Response> {
  const now = Date.now()
  const month = parseArticleMonth(request.nextUrl.searchParams.get('month'), now)
  if (!month) return sitemapNotFound()
  try {
    const rows = await getArticleMonthRows(month, now)
    return xmlResponse(buildUrlsetXml(rows.map((r) => ({
      loc: articleUrl(SITE_BASE, r.s),
      lastmod: r.m,
      changefreq: 'monthly',
      priority: 0.6,
    }))))
  } catch (err) {
    return sitemapUnavailable(`articles:${month}`, err)
  }
}
