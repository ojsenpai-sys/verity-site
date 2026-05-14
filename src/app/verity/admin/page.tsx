export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import Link from 'next/link'
import { Newspaper, FilePlus, Eye, FileX, BarChart3, ArrowRight } from 'lucide-react'
import { adminFetchNewsList } from '@/app/verity/actions/admin-news'

export const metadata: Metadata = { title: 'Dashboard — VERITY Admin' }

function StatCard({
  label, value, icon, accent,
}: {
  label: string; value: number; icon: React.ReactNode; accent: string
}) {
  return (
    <div className={`rounded-xl border bg-[var(--surface)] p-5 space-y-2 ${accent}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {label}
        </span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-[var(--text)]">{value}</p>
    </div>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminDashboardPage() {
  const { items, stats } = await adminFetchNewsList(5, 0)
  const recent = items.slice(0, 5)

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">

      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-amber-400" />
          <h1 className="text-xl font-bold text-[var(--text)]">ダッシュボード</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">VERITY 管理コンソール</p>
        <div className="h-px w-full bg-gradient-to-r from-amber-500/40 via-amber-500/15 to-transparent" />
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="総記事数"
          value={stats.total}
          icon={<Newspaper size={18} className="text-amber-400" />}
          accent="border-amber-500/20"
        />
        <StatCard
          label="公開中"
          value={stats.published}
          icon={<Eye size={18} className="text-emerald-400" />}
          accent="border-emerald-500/20"
        />
        <StatCard
          label="下書き"
          value={stats.drafts}
          icon={<FileX size={18} className="text-[var(--text-muted)]" />}
          accent="border-[var(--border)]"
        />
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/verity/admin/news/new"
          className="group flex items-center gap-3 rounded-xl border border-[var(--magenta)]/30 bg-[var(--surface)] p-5 hover:border-[var(--magenta)]/70 hover:shadow-[0_0_20px_rgba(226,0,116,0.15)] transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--magenta)]/15">
            <FilePlus size={18} className="text-[var(--magenta)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--text)]">新規記事を作成</p>
            <p className="text-xs text-[var(--text-muted)]">Markdown エディタで入稿</p>
          </div>
          <ArrowRight size={16} className="ml-auto text-[var(--text-muted)] group-hover:text-[var(--magenta)] transition-colors" />
        </Link>

        <Link
          href="/verity/admin/news"
          className="group flex items-center gap-3 rounded-xl border border-amber-500/20 bg-[var(--surface)] p-5 hover:border-amber-500/50 transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
            <Newspaper size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-[var(--text)]">記事一覧</p>
            <p className="text-xs text-[var(--text-muted)]">公開・下書きを管理</p>
          </div>
          <ArrowRight size={16} className="ml-auto text-[var(--text-muted)] group-hover:text-amber-400 transition-colors" />
        </Link>
      </div>

      {/* 最近の記事 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text)]">最近の記事</h2>
          <Link href="/verity/admin/news" className="text-xs text-[var(--text-muted)] hover:text-amber-400 transition-colors">
            すべて見る →
          </Link>
        </div>

        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {recent.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">記事がありません</p>
          )}
          {recent.map(news => (
            <div key={news.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                news.is_published
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-[var(--surface-2)] text-[var(--text-muted)]'
              }`}>
                {news.is_published ? '公開' : '下書き'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text)]">{news.title}</p>
                {news.actress && (
                  <p className="text-[11px] text-[var(--text-muted)]">{news.actress.name}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">
                {formatDate(news.published_at ?? news.created_at)}
              </span>
              <Link
                href={`/verity/admin/news/${news.slug}/edit`}
                className="shrink-0 text-xs text-[var(--text-muted)] hover:text-amber-400 transition-colors"
              >
                編集
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
