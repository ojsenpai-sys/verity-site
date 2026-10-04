import { actressUrl, buildUrlsetXml } from '@/lib/sitemapCore.mjs'
import { getActressRows } from '@/lib/sitemapData'
import { SITE_BASE, sitemapUnavailable, xmlResponse } from '@/lib/sitemapHttp'

// /sitemap-actresses.xml — 全 active 女優。URL は実ページ canonical（/verity/actresses/<external_id>）。
// lastmod は信頼できる日時列が無いため出さない。
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const rows = await getActressRows()
    return xmlResponse(buildUrlsetXml(rows.map((r) => ({
      loc: actressUrl(SITE_BASE, r.s),
      changefreq: 'weekly',
      priority: 0.7,
    }))))
  } catch (err) {
    return sitemapUnavailable('actresses', err)
  }
}
