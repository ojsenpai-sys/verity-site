export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { Newspaper } from 'lucide-react'
import { fetchNewsList } from '@/app/verity/actions/news'
import { NewsListClient } from '@/components/NewsListClient'

export const metadata: Metadata = {
  title: 'ニュース',
  description: 'VERITY編集部が届ける最新ニュース・インタビュー・女優情報。FANZAの人気作品・新作情報をいち早くお届け。',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/news` },
}

const INITIAL_LIMIT = 20

export default async function NewsPage() {
  const { items, hasMore } = await fetchNewsList(INITIAL_LIMIT, 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Newspaper size={20} className="text-[var(--magenta)]" />
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">NEWS</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          最新情報・インタビュー・イベントレポートをお届けします
        </p>
        <div className="mt-2 h-px w-full bg-gradient-to-r from-[var(--magenta)]/60 via-[var(--magenta)]/20 to-transparent" />
      </div>

      <NewsListClient initialItems={items} initialHasMore={hasMore} />
    </div>
  )
}
