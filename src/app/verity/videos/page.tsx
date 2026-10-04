import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { getVideoDiscoveryShelves } from '@/lib/videoDiscovery'
import { VideoDiscoveryShelves, type Shelf } from '@/components/video/VideoDiscoveryShelves'

// VERITY VIDEO DISCOVERY（Phase 1 MVP）。
// NEW RELEASES / POPULAR ON VERITY を各最大6本、横スクロールの棚で表示する。
// 初期HTMLはポスター＋作品ページリンクのみ（iframe=0）。サンプル動画はカード操作時にのみ
// FANZA公式 litevideo iframe を1つだけ開く（VideoPreviewDialog）。
// データは既存キャッシュ（Latest / works_ranking_cache）のみ。リージョン別アフィリエイトURL
// 解決のため（Accept-Language）リクエスト毎に描画する。
export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export const metadata: Metadata = {
  title: 'VIDEO DISCOVERY — 動画から作品を探す',
  description: '新着と人気の作品を、FANZA公式サンプル動画でまず見て探す。VERITYのビデオディスカバリー。',
  alternates: { canonical: `${BASE}/verity/videos` },
}

export default async function VideoDiscoveryPage() {
  const { newReleases, popular } = await getVideoDiscoveryShelves()

  const shelves: Shelf[] = [
    { row: 'new',     label: 'NEW RELEASES',      sub: '発売されたばかりの作品', items: newReleases },
    { row: 'popular', label: 'POPULAR ON VERITY', sub: 'VERITYで今よく見られている作品', items: popular },
  ]
  const isEmpty = newReleases.length === 0 && popular.length === 0

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-10">
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]" aria-label="パンくずリスト">
        <Link href="/verity" className="transition-colors hover:text-[var(--magenta)]">VERITY</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">VIDEO DISCOVERY</span>
      </nav>

      <header className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--magenta)]">VERITY</p>
        <h1 className="text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">VIDEO DISCOVERY</h1>
        <p className="text-sm text-[var(--text-muted)]">気になる作品を、まず見て探す。</p>
      </header>

      {isEmpty ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]">
          現在表示できる作品がありません。時間をおいて再度お試しください。
        </p>
      ) : (
        <VideoDiscoveryShelves shelves={shelves} />
      )}

      <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
        サンプル動画はFANZA公式プレイヤーで再生されます。※18歳以上を対象としたアダルトコンテンツです。
      </p>
    </div>
  )
}
