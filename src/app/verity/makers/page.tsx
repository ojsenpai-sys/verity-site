import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { MAKERS } from '@/lib/makers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'MAKERS — メーカー一覧',
  description: `VERITYが収録する主要AVメーカー${MAKERS.length}社の最新作・予約作品カタログ。S1、MOODYZ、Prestige、PREMIUM など人気スタジオの新作スケジュールをいち早くチェック。`,
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/verity/makers` },
}

// Deterministic neon accent per card (cycles through palette)
const NEON_ACCENTS = [
  { border: 'border-[var(--magenta)]/25', glow: 'hover:border-[var(--magenta)]/60 hover:shadow-[0_0_24px_rgba(226,0,116,0.18)]', tag: 'text-[var(--magenta)]/70' },
  { border: 'border-violet-500/25',       glow: 'hover:border-violet-400/55 hover:shadow-[0_0_24px_rgba(139,92,246,0.18)]',       tag: 'text-violet-400/70' },
  { border: 'border-sky-500/25',          glow: 'hover:border-sky-400/55 hover:shadow-[0_0_24px_rgba(56,189,248,0.18)]',          tag: 'text-sky-400/70' },
  { border: 'border-amber-500/25',        glow: 'hover:border-amber-400/55 hover:shadow-[0_0_24px_rgba(251,191,36,0.18)]',        tag: 'text-amber-400/70' },
  { border: 'border-emerald-500/25',      glow: 'hover:border-emerald-400/55 hover:shadow-[0_0_24px_rgba(52,211,153,0.18)]',      tag: 'text-emerald-400/70' },
  { border: 'border-rose-500/25',         glow: 'hover:border-rose-400/55 hover:shadow-[0_0_24px_rgba(251,113,133,0.18)]',        tag: 'text-rose-400/70' },
]

export default function MakersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

      {/* パンくず */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">MAKERS</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        <h1 className="text-3xl font-black tracking-tight text-[var(--text)]">
          MAKERS
        </h1>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
          {MAKERS.length}社のメーカー最新作・予約作品を毎日 0:00 JST に自動巡回。
          同一作品は1ページに集約されます（1作品1記事ルール）。
        </p>
      </div>

      {/* メーカーグリッド */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {MAKERS.map((maker, idx) => {
          const accent = NEON_ACCENTS[idx % NEON_ACCENTS.length]
          return (
            <Link
              key={maker.id}
              href={`/verity/makers/${maker.id}`}
              className={`group relative flex flex-col gap-2 rounded-xl border bg-white/[0.03] backdrop-blur-sm px-4 py-4 transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.06] ${accent.border} ${accent.glow}`}
            >
              {/* メーカー名 */}
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-bold leading-snug text-[var(--text)] group-hover:text-white transition-colors line-clamp-2">
                  {maker.name}
                </p>
                <ChevronRight
                  size={13}
                  className="mt-0.5 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--magenta)] transition-all group-hover:translate-x-0.5"
                />
              </div>

              {/* 英字名 */}
              {maker.nameEn && maker.nameEn !== maker.name && (
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${accent.tag}`}>
                  {maker.nameEn}
                </p>
              )}

              {/* 説明 */}
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-2 mt-auto">
                {maker.description}
              </p>
            </Link>
          )
        })}
      </div>

      {/* フッター */}
      <p className="text-center text-[11px] text-[var(--text-muted)]">
        作品情報は FANZA Affiliate API v3 より取得。毎日 0:00 JST に自動更新。
      </p>
    </div>
  )
}
