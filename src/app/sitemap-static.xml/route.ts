import { buildUrlsetXml, staticEntries } from '@/lib/sitemapCore.mjs'
import { SITE_BASE, xmlResponse } from '@/lib/sitemapHttp'
import { SPOTLIGHTS } from '@/lib/spotlights'

// /sitemap-static.xml — static ページ + VERITY Spotlight（lib/spotlights.ts レジストリ由来）。DB 非依存。
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return xmlResponse(buildUrlsetXml(staticEntries(SITE_BASE, SPOTLIGHTS)), 3600)
}
