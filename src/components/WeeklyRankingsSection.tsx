import { getLatestWeeklyRankings } from '@/lib/weeklyRankings'
import { WeeklyRankingsTabs } from '@/components/WeeklyRankingsTabs'

// トップページの VERITY WEEKLY RANKINGS セクション（サーバー取得 → クライアントタブ）。
// 最新の確定週（published_at<=now）が無い場合はセクションごと非表示にグレースフル劣化する。
// LCP非依存の位置（FastestNewReleases 直後・Hero下）に配置する前提。
export async function WeeklyRankingsSection() {
  const data = await getLatestWeeklyRankings()
  if (!data) return null
  return (
    <section id="weekly-rankings">
      <WeeklyRankingsTabs data={data} />
    </section>
  )
}
