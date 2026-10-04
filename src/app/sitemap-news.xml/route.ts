import { buildUrlsetXml, newsUrl } from '@/lib/sitemapCore.mjs'
import { getNewsRows } from '@/lib/sitemapData'
import { SITE_BASE, sitemapUnavailable, xmlResponse } from '@/lib/sitemapHttp'

// /sitemap-news.xml — 公開済みニュース全件（1000 件超にもページングで対応）。lastmod = updated_at。
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const rows = await getNewsRows()
    return xmlResponse(buildUrlsetXml(rows.map((r) => ({
      loc: newsUrl(SITE_BASE, r.s),
      lastmod: r.m,
      changefreq: 'monthly',
      priority: 0.6,
    }))))
  } catch (err) {
    return sitemapUnavailable('news', err)
  }
}
