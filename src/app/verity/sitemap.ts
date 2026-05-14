import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE,                    changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/actresses`,     changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/news`,          changeFrequency: 'daily',   priority: 0.8 },
  ]

  // 女優ページ（全件 range で取得）
  const { data: actresses } = await supabase
    .from('actresses')
    .select('external_id')
    .eq('is_active', true)
    .not('external_id', 'like', '%mock%')
    .range(0, 4999)

  const actressEntries: MetadataRoute.Sitemap = (actresses ?? []).map(a => ({
    url: `${BASE}/actresses/${a.external_id}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  // 記事ページ（発売済みのみ）
  const { data: articles } = await supabase
    .from('articles')
    .select('slug, published_at, fetched_at')
    .eq('is_active', true)
    .lte('published_at', new Date().toISOString())
    .not('slug', 'like', '%mock%')
    .range(0, 4999)

  const articleEntries: MetadataRoute.Sitemap = (articles ?? []).map(a => ({
    url: `${BASE}/articles/${a.slug}`,
    lastModified: a.fetched_at ?? a.published_at ?? undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  // ニュースページ
  const { data: news } = await supabase
    .from('sn_news')
    .select('slug, updated_at')
    .eq('is_published', true)
    .range(0, 4999)

  const newsEntries: MetadataRoute.Sitemap = (news ?? []).map(n => ({
    url: `${BASE}/news/${n.slug}`,
    lastModified: n.updated_at ?? undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...actressEntries, ...articleEntries, ...newsEntries]
}
