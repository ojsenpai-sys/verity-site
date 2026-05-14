import Link from 'next/link'
import { LayoutDashboard, Newspaper, FilePlus, Settings, ChevronRight, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type NavItem = {
  href:  string
  label: string
  icon:  React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  { href: '/verity/admin',          label: 'ダッシュボード', icon: <LayoutDashboard size={16} /> },
  { href: '/verity/admin/news',     label: 'ニュース一覧',   icon: <Newspaper size={16} /> },
  { href: '/verity/admin/news/new', label: '新規作成',       icon: <FilePlus size={16} /> },
  { href: '/verity/admin/settings', label: '設定',           icon: <Settings size={16} /> },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-[calc(100vh-120px)]">

      {/* ── サイドバー ──────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">

        {/* 管理者バッジ */}
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20">
            <Shield size={14} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Admin</p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">{user?.email}</p>
          </div>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-all"
            >
              <span className="text-[var(--text-muted)] group-hover:text-amber-400 transition-colors">
                {item.icon}
              </span>
              {item.label}
              <ChevronRight size={12} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)]" />
            </Link>
          ))}
        </nav>

        {/* フッターリンク */}
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
          <Link
            href="/verity"
            className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            ← サイトへ戻る
          </Link>
        </div>
      </aside>

      {/* ── モバイル用タブバー ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
        {NAV_ITEMS.slice(0, 3).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[var(--text-muted)] hover:text-amber-400 transition-colors"
          >
            {item.icon}
            <span className="text-[9px]">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* ── メインコンテンツ ─────────────────────────────────── */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {children}
      </main>
    </div>
  )
}
