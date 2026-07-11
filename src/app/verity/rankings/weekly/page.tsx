import type { Metadata } from 'next'
import Link from 'next/link'
import { Trophy, ChevronRight } from 'lucide-react'
import { getLatestWeeklyRankings, listWeeklyWeekKeys } from '@/lib/weeklyRankings'
import { WeeklyRankingsTabs } from '@/components/WeeklyRankingsTabs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return {
    title: 'VERITY WEEKLY RANKINGS — 週間ランキング',
    description: 'VERITY内の実閲覧データによる独自週間ランキング。毎週日曜23:30発表。女優・作品・メーカー・新人・急上昇の5部門。',
    alternates: { canonical: `${siteUrl}/verity/rankings/weekly` },
  }
}

export default async function WeeklyRankingsArchivePage() {
  const [data, weekKeys] = await Promise.all([getLatestWeeklyRankings(), listWeeklyWeekKeys(52)])
  const pastKeys = data ? weekKeys.filter((k) => k !== data.weekKey) : weekKeys

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-[var(--magenta)] text-white">
            <Trophy size={16} />
          </span>
          <h1 className="text-xl font-black tracking-tight text-[var(--text)]">VERITY WEEKLY RANKINGS</h1>
        </div>
        <p className="text-[12px] text-[var(--text-muted)]">
          FANZA公式ではなく、VERITY内の実閲覧データ（Human判定済み）による独自ランキング。毎週日曜23:30に確定・固定表示。
        </p>
      </header>

      {data ? (
        <WeeklyRankingsTabs data={data} showArchiveLink={false} />
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[13px] text-[var(--text-muted)]">
          最初の週間ランキングは日曜23:30に発表されます。準備中です。
        </div>
      )}

      {pastKeys.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--text)]">過去の週間ランキング</h2>
          <ul className="divide-y divide-[var(--border)]/60 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {pastKeys.map((k) => (
              <li key={k}>
                <Link href={`/verity/rankings/weekly/${k}`} className="flex items-center justify-between px-4 py-2.5 text-[13px] text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]">
                  <span>{k} の週</span>
                  <ChevronRight size={14} className="text-[var(--text-muted)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
