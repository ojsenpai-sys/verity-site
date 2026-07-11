import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Trophy, ChevronLeft } from 'lucide-react'
import { getWeeklyRankingsByKey } from '@/lib/weeklyRankings'
import { WeeklyRankingsTabs } from '@/components/WeeklyRankingsTabs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = { params: Promise<{ weekKey: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { weekKey } = await params
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return {
    title: `${weekKey} の週間ランキング — VERITY WEEKLY RANKINGS`,
    description: `${weekKey} 週の VERITY 独自週間ランキング（女優・作品・メーカー・新人・急上昇）。`,
    alternates: { canonical: `${siteUrl}/verity/rankings/weekly/${weekKey}` },
  }
}

export default async function WeeklyRankingsByKeyPage({ params }: PageProps) {
  const { weekKey } = await params
  const data = await getWeeklyRankingsByKey(weekKey)
  if (!data) notFound()

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/verity/rankings/weekly" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
          <ChevronLeft size={14} /> 週間ランキング一覧
        </Link>
        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
          <Trophy size={13} /> {weekKey} の週
        </span>
      </div>
      <WeeklyRankingsTabs data={data} showArchiveLink={false} />
    </main>
  )
}
