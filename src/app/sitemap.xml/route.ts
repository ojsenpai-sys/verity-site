import { buildSitemapIndexXml, childSitemapUrls } from '@/lib/sitemapCore.mjs'
import { SITE_BASE, xmlResponse } from '@/lib/sitemapHttp'

// /sitemap.xml — sitemap index（robots.txt が案内する正式 sitemap）。
// DB に一切依存しない（作品月は 2007-02〜現在の JST 月を列挙。Phase 0 で全月に作品が存在することを確認済み）。
// 旧 src/app/sitemap.ts（URL を直接列挙する単一 sitemap）を置き換える。
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return xmlResponse(buildSitemapIndexXml(childSitemapUrls(SITE_BASE, Date.now())), 3600)
}
