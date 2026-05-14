export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import Link from 'next/link'
import { FilePlus, Newspaper } from 'lucide-react'
import { adminFetchNewsList } from '@/app/verity/actions/admin-news'
import { AdminNewsTable } from '@/components/admin/AdminNewsTable'

export const metadata: Metadata = { title: 'ニュース一覧 — VERITY Admin' }

export default async function AdminNewsListPage() {
  const { items, stats } = await adminFetchNewsList(100, 0)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Newspaper size={18} className="text-amber-400" />
          <h1 className="text-xl font-bold text-[var(--text)]">ニュース一覧</h1>
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {stats.total}件
          </span>
        </div>
        <Link
          href="/verity/admin/news/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--magenta)] px-4 py-2 text-sm font-bold text-white shadow-[0_0_16px_rgba(226,0,116,0.3)] hover:brightness-110 transition-all"
        >
          <FilePlus size={14} />
          新規作成
        </Link>
      </div>

      {/* フィルタータブ */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 w-fit text-sm">
        <span className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 font-medium text-[var(--text)]">
          すべて ({stats.total})
        </span>
        <span className="px-3 py-1.5 text-[var(--text-muted)]">
          公開 ({stats.published})
        </span>
        <span className="px-3 py-1.5 text-[var(--text-muted)]">
          下書き ({stats.drafts})
        </span>
      </div>

      <AdminNewsTable initialItems={items} />
    </div>
  )
}
