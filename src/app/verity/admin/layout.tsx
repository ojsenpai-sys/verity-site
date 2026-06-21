import { Shield } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/adminAuth'
import AdminNav from './AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 管理者限定（OTPは任意メールに届くため、許可メールで明示ゲート）
  if (!user) redirect('/verity/login?next=/verity/admin')
  if (!isAdminEmail(user.email)) redirect('/verity')

  return (
    <div className="flex min-h-[calc(100vh-120px)]">

      {/* ── サイドバー ──────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">

        {/* 管理者バッジ */}
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-4">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'rgba(170,255,0,0.12)', border: '1px solid rgba(170,255,0,0.25)' }}
          >
            <Shield size={14} style={{ color: '#aaff00' }} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: '#aaff00' }}>
              Admin
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">{user?.email}</p>
          </div>
        </div>

        {/* ナビゲーション（client component で active 状態を管理） */}
        <AdminNav />

        {/* フッターリンク */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          <Link
            href="/verity"
            className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            ← サイトへ戻る
          </Link>
        </div>
      </aside>

      {/* ── メインコンテンツ ─────────────────────────────────── */}
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {children}
      </main>
    </div>
  )
}
