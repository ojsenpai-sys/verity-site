import Link from 'next/link'
import { Flame, ChevronRight } from 'lucide-react'
import { getHomepageFastestReleasesSections } from '@/lib/fastestReleases'
import { FastestReleaseMakerSection } from '@/components/FastestReleaseMakerSection'

export async function FastestNewReleases() {
  const makerSections = await getHomepageFastestReleasesSections()

  if (!makerSections.length) return null

  return (
    <section id="fastest-new-releases" className="space-y-8">
      {/* ── ヘッダー ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-orange-500 to-red-600" />
          <Flame size={18} className="text-orange-400 animate-pulse" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            最新作最速更新情報
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/15 px-2.5 py-0.5 text-[10px] font-black text-red-400 border border-red-600/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            NEW
          </span>
        </div>
        <p className="pl-6 text-[11px] tracking-wide text-[var(--text-muted)]">
          解禁されたばかりの最旬注目作を最速でお届け！
        </p>
      </div>

      {/* ── メーカー別セクション(直近更新順・上位8社) ─────────────────── */}
      {makerSections.map((section) => (
        <FastestReleaseMakerSection key={section.id} section={section} />
      ))}

      {/* ── 全メーカー最新作ページへの導線(Phase 1) ─────────────────────── */}
      <div className="flex justify-center pt-1">
        <Link
          href="/verity/latest"
          className="flex items-center gap-1 text-[12px] font-bold text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          すべてのメーカーの最新作を見る
          <ChevronRight size={13} />
        </Link>
      </div>
    </section>
  )
}
