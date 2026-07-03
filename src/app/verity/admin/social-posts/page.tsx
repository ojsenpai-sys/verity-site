export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { Share2 } from 'lucide-react'
import SocialPostsWorkspace from './SocialPostsWorkspace'

export const metadata: Metadata = { title: 'X投稿生成 — VERITY Admin' }

export default function AdminSocialPostsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Share2 size={18} className="text-[var(--magenta)]" />
          <h1 className="text-xl font-bold text-[var(--text)]">X投稿生成</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          ランキング・新作・セールから多言語（日本語 / English / 中文 / まとめ）の投稿文を生成します。
          自動投稿はしません — 生成 → コピー → 手動投稿の運用です。
        </p>
        <div className="h-px w-full bg-gradient-to-r from-[var(--magenta)]/50 via-[var(--magenta)]/15 to-transparent" />
      </div>

      <SocialPostsWorkspace />
    </div>
  )
}
