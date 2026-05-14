import type { Metadata } from 'next'
import { Settings } from 'lucide-react'

export const metadata: Metadata = { title: '設定 — VERITY Admin' }

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div className="flex items-center gap-2.5">
        <Settings size={18} className="text-[var(--text-muted)]" />
        <h1 className="text-xl font-bold text-[var(--text)]">設定</h1>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
        <p className="text-[var(--text-muted)]">設定機能は今後追加予定です</p>
      </div>
    </div>
  )
}
