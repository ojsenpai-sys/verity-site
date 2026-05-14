import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Header } from '@/components/Header'
import { MegaFooter } from '@/components/MegaFooter'
import { ScrollToTop } from '@/components/ScrollToTop'
import { AgeGate } from '@/components/AgeGate'
import { AuthProvider } from '@/components/AuthProvider'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default:  'VERITY — FANZAデータ直結のAVキュレーション・メディア',
    template: '%s — VERITY',
  },
  description: '1,100名超の女優データ × プロのインタビュー × AI が融合した次世代アダルトメディア。人気女優の最新作・動画をVERITY編集部がキュレーション。',
  icons: { icon: '/assets/verity/icon.png.png' },
  openGraph: {
    type:     'website',
    siteName: 'VERITY',
    locale:   'ja_JP',
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index:  true,
    follow: true,
  },
}

export default async function VerityLayout({ children }: { children: React.ReactNode }) {
  // サーバー側でセッションを取得してクライアントに渡す（初期ハイドレーション用）
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <AuthProvider initialUser={user}>
      <div className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text)]">
        {/* 景品表示法に基づく広告表示 */}
        <div className="w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 py-1.5 text-center text-[11px] text-[var(--text-muted)] tracking-wide">
          本ページにはプロモーション（広告・アフィリエイトリンク）が含まれています
        </div>
        <Suspense><AgeGate /></Suspense>
        <Header />
        <main className="flex-1">{children}</main>
        <MegaFooter />
        <ScrollToTop />
      </div>
    </AuthProvider>
  )
}
