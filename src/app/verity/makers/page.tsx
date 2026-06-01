import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import { MAKERS } from '@/lib/makers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'メーカー一覧',
  description: 'VERITYが厳選した主要AVメーカー13社の最新作・予約作品カタログ。S1、MOODYZ、Prestige、PREMIUM など人気スタジオの新作スケジュールをいち早くチェック。',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/verity/makers` },
}

// 各メーカーに個性を出すための決定論的カラー
const CARD_ACCENTS = [
  'from-pink-600/20 to-rose-600/20 border-pink-500/30',
  'from-violet-600/20 to-purple-600/20 border-violet-500/30',
  'from-sky-600/20 to-blue-600/20 border-sky-500/30',
  'from-amber-600/20 to-orange-600/20 border-amber-500/30',
  'from-emerald-600/20 to-teal-600/20 border-emerald-500/30',
  'from-red-600/20 to-pink-600/20 border-red-500/30',
  'from-indigo-600/20 to-blue-600/20 border-indigo-500/30',
  'from-fuchsia-600/20 to-pink-600/20 border-fuchsia-500/30',
  'from-cyan-600/20 to-sky-600/20 border-cyan-500/30',
  'from-lime-600/20 to-green-600/20 border-lime-500/30',
  'from-orange-600/20 to-red-600/20 border-orange-500/30',
  'from-teal-600/20 to-cyan-600/20 border-teal-500/30',
  'from-rose-600/20 to-fuchsia-600/20 border-rose-500/30',
]

const INITIAL_COLORS = [
  'bg-pink-600/30 text-pink-300',
  'bg-violet-600/30 text-violet-300',
  'bg-sky-600/30 text-sky-300',
  'bg-amber-600/30 text-amber-300',
  'bg-emerald-600/30 text-emerald-300',
  'bg-red-600/30 text-red-300',
  'bg-indigo-600/30 text-indigo-300',
  'bg-fuchsia-600/30 text-fuchsia-300',
  'bg-cyan-600/30 text-cyan-300',
  'bg-lime-600/30 text-lime-300',
  'bg-orange-600/30 text-orange-300',
  'bg-teal-600/30 text-teal-300',
  'bg-rose-600/30 text-rose-300',
]

export default function MakersPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

      {/* ヘッダー */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-3">
          <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
          <ChevronRight size={12} />
          <span className="text-[var(--text)]">メーカー</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--magenta)]/15 border border-[var(--magenta)]/30">
            <Building2 size={20} className="text-[var(--magenta)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">メーカー</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {MAKERS.length}社のメーカーカタログ — 新作・予約情報を毎日自動巡回
            </p>
          </div>
        </div>
      </div>

      {/* 説明バナー */}
      <div className="rounded-xl border border-[var(--magenta)]/20 bg-[var(--magenta)]/5 px-5 py-4">
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          VERITYが厳選した主要メーカーの新作・予約作品を毎日自動で巡回。
          同一作品は必ず1ページに集約（1作品1記事ルール）されるため、
          動画配信・DVD・限定盤が同一ページで確認できます。
        </p>
      </div>

      {/* メーカーグリッド */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MAKERS.map((maker, idx) => (
          <Link
            key={maker.id}
            href={`/verity/makers/${maker.id}`}
            className={`group relative flex items-start gap-4 rounded-xl border bg-gradient-to-br p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] ${CARD_ACCENTS[idx % CARD_ACCENTS.length]}`}
          >
            {/* 頭文字アイコン */}
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-black tracking-tight ${INITIAL_COLORS[idx % INITIAL_COLORS.length]}`}>
              {(maker.nameEn ?? maker.name).charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors leading-tight">
                    {maker.name}
                  </h2>
                  {maker.nameEn && maker.nameEn !== maker.name && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{maker.nameEn}</p>
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--magenta)] transition-all group-hover:translate-x-0.5"
                />
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2">
                {maker.description}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--magenta)] group-hover:underline underline-offset-2">
                最新作カタログを見る
                <ChevronRight size={10} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* フッター注記 */}
      <p className="text-center text-[11px] text-[var(--text-muted)]">
        作品情報はFANZA Affiliate API v3 より取得。毎日 0:00 JST に自動更新。
      </p>
    </div>
  )
}
