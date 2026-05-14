export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { Edit } from 'lucide-react'
import { adminFetchNewsBySlug, adminFetchActresses } from '@/app/verity/actions/admin-news'
import { NewsEditor } from '@/components/admin/NewsEditor'
import type { Metadata } from 'next'

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `記事編集: ${slug} — VERITY Admin` }
}

export default async function AdminNewsEditPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const [news, actresses] = await Promise.all([
    adminFetchNewsBySlug(slug),
    adminFetchActresses(),
  ])
  if (!news) notFound()

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-2.5">
        <Edit size={18} className="text-amber-400" />
        <h1 className="text-xl font-bold text-[var(--text)]">記事編集</h1>
        <span className="font-mono text-sm text-[var(--text-muted)]">/{slug}</span>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-amber-500/40 via-amber-500/15 to-transparent" />

      <NewsEditor
        actresses={actresses}
        editSlug={slug}
        initialData={{
          title:         news.title,
          slug:          news.slug,
          category:      news.category ?? 'NEWS',
          summary:       news.summary ?? '',
          actress_id:    news.actress_id ?? '',
          content:       news.content,
          thumbnail_url: news.thumbnail_url ?? '',
          gallery_urls:  news.gallery_urls,
          fanza_link:    news.fanza_link ?? '',
          tags:          news.tags,
          is_published:  news.is_published,
        }}
      />
    </div>
  )
}
