export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { FilePlus } from 'lucide-react'
import { adminFetchActresses } from '@/app/verity/actions/admin-news'
import { NewsEditor } from '@/components/admin/NewsEditor'

export const metadata: Metadata = { title: '新規記事作成 — VERITY Admin' }

export default async function AdminNewsNewPage() {
  const actresses = await adminFetchActresses()

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-2.5">
        <FilePlus size={18} className="text-[var(--magenta)]" />
        <h1 className="text-xl font-bold text-[var(--text)]">新規記事作成</h1>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-[var(--magenta)]/50 via-[var(--magenta)]/15 to-transparent" />

      <NewsEditor actresses={actresses} />
    </div>
  )
}
