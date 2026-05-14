import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/auth/',
          '/profile/',
          '/login/',
          '/api/',
          '/presentation/',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
