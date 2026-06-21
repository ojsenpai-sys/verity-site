import type { Metadata } from 'next'
import { BarChart3 } from 'lucide-react'
import {
  getDailyMetrics, getOverview, getEngagement, getFanza, getTags, getPreference, getInvestor,
} from '@/lib/adminAnalytics'
import { AnalyticsCharts } from './AnalyticsCharts'

export const metadata: Metadata = { title: 'Analytics — VERITY Admin' }
export const dynamic = 'force-dynamic'

const fmt = (n: number) => n.toLocaleString('ja-JP')
const proxy = (url: string | null) => url ? `/api/proxy/image?url=${encodeURIComponent(url)}` : '/assets/verity/placeholder.jpg'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums" style={{ color: '#aaff00' }}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: '#aaff00' }}>{title}</h2>
      {children}
    </section>
  )
}

export default async function AnalyticsPage() {
  const daily = await getDailyMetrics()
  const [overview, engagement, fanza, tags, preference, investor] = await Promise.all([
    getOverview(daily), getEngagement(daily), getFanza(daily), getTags(), getPreference(), getInvestor(daily),
  ])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(170,255,0,0.12)', border: '1px solid rgba(170,255,0,0.3)' }}>
          <BarChart3 size={15} style={{ color: '#aaff00' }} />
        </div>
        <div>
          <h1 className="text-lg font-black tracking-tight" style={{ color: '#aaff00' }}>Analytics — 分析基盤 v1</h1>
          <p className="text-[11px] text-[var(--text-muted)]">事前集計（daily_metrics / *_summary / *_popularity）から取得</p>
        </div>
      </div>

      {/* Overview */}
      <Section title="Overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="総会員数" value={fmt(overview.totalMembers)} />
          <Stat label="新規(今日)" value={fmt(overview.newToday)} />
          <Stat label="新規(7日)" value={fmt(overview.new7d)} />
          <Stat label="新規(30日)" value={fmt(overview.new30d)} />
          <Stat label="ログイン率" value={`${overview.loginRate}%`} sub="DAU÷総会員" />
          <Stat label="DAU" value={fmt(overview.dau)} />
          <Stat label="WAU" value={fmt(overview.wau)} />
          <Stat label="MAU" value={fmt(overview.mau)} />
          <Stat label="Stickiness" value={`${overview.stickiness}%`} sub="DAU÷MAU" />
        </div>
      </Section>

      {/* Engagement */}
      <Section title="Engagement">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="お気に入り作品数" value={fmt(engagement.favWorks)} />
          <Stat label="お気に入り女優数" value={fmt(engagement.favActresses)} />
          <Stat label="総閲覧履歴数" value={fmt(engagement.totalViews)} sub="作品閲覧" />
          <Stat label="平均閲覧/人" value={fmt(engagement.avgViewsPerUser)} sub="÷MAU" />
          <Stat label="平均お気に入り/人" value={fmt(engagement.avgFavsPerUser)} sub="÷総会員" />
        </div>
      </Section>

      {/* FANZA */}
      <Section title="FANZA">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="総クリック数" value={fmt(fanza.totalClicks)} />
          <Stat label="今日のクリック" value={fmt(fanza.clicksToday)} />
          <Stat label="7日クリック" value={fmt(fanza.clicks7d)} />
          <Stat label="CTR" value={`${fanza.ctr}%`} sub="clicks÷閲覧" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">人気作品 TOP20（30日スコア）</p>
            <ol className="space-y-1.5">
              {fanza.popularWorks.map((w, i) => (
                <li key={w.external_id} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proxy(w.image_url)} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
                  <span className="flex-1 truncate text-xs text-[var(--text)]">{w.title}</span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: '#aaff00' }}>{fmt(Number(w.score_30d) || 0)}</span>
                </li>
              ))}
              {fanza.popularWorks.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">データなし</p>}
            </ol>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">人気女優 TOP20（30日スコア）</p>
            <ol className="space-y-1.5">
              {fanza.popularActresses.map((a, i) => (
                <li key={a.external_id} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proxy(a.image_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  <span className="flex-1 truncate text-xs text-[var(--text)]">{a.name}</span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: '#aaff00' }}>{fmt(Number(a.score_30d) || 0)}</span>
                </li>
              ))}
              {fanza.popularActresses.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">データなし</p>}
            </ol>
          </div>
        </div>
      </Section>

      {/* Tags */}
      <Section title="Tags（タグ≒ジャンル）">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">人気タグ TOP50（30日）</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.popular.map(t => (
                <span key={t.tag} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] text-[var(--text)]">
                  {t.tag} <span className="text-[var(--text-muted)] tabular-nums">{fmt(Number(t.score_30d) || 0)}</span>
                </span>
              ))}
              {tags.popular.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">データなし</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">急上昇タグ（7日 vs 前週比）</p>
            <ol className="space-y-1.5">
              {tags.rising.map((t, i) => (
                <li key={t.tag} className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
                  <span className="w-5 shrink-0 text-center text-[11px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                  <span className="flex-1 truncate text-xs text-[var(--text)]">{t.tag}</span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: '#fbbf24' }}>×{t.rising}</span>
                </li>
              ))}
              {tags.rising.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">データなし</p>}
            </ol>
          </div>
        </div>
      </Section>

      {/* User Growth */}
      <Section title="User Growth">
        <AnalyticsCharts daily={daily} />
      </Section>

      {/* Preference（匿名集計） */}
      <Section title="Preference（行動由来・匿名集計）">
        <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {preference.map(p => (
            <div key={p.tag} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs text-[var(--text)]">{p.tag}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: '#E20074' }} />
              </div>
              <span className="w-12 shrink-0 text-right text-[11px] font-bold tabular-nums text-[var(--text-muted)]">{p.pct}%</span>
            </div>
          ))}
          {preference.length === 0 && <p className="text-[11px] text-[var(--text-muted)]">嗜好プロファイル未生成（refresh_user_profiles 実行後に表示）</p>}
        </div>
      </Section>

      {/* Investor Metrics */}
      <Section title="Investor Metrics">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="登録会員数" value={fmt(investor.registeredMembers)} />
          <Stat label="MAU" value={fmt(investor.mau)} />
          <Stat label="Stickiness" value={`${investor.stickiness}%`} sub="DAU÷MAU" />
          <Stat label="7日継続率" value={`${investor.retention7d}%`} sub="出戻り率" />
          <Stat label="お気に入り総数" value={fmt(investor.favoriteTotal)} />
          <Stat label="Favorite Utilization" value={`${investor.favoriteUtilization}%`} sub="行動会員比率" />
          <Stat label="作品保存率" value={`${investor.workSaveRate}%`} />
          <Stat label="女優フォロー率" value={`${investor.actressFollowRate}%`} />
          <Stat label="月間イベント数" value={fmt(investor.monthlyEvents)} />
          <Stat label="平均閲覧深度" value={fmt(investor.avgDepth)} sub="events÷MAU" />
          <Stat label="FANZA送客数" value={fmt(investor.fanzaReferrals)} sub="累計" />
          <Stat label="Content Coverage" value={`${fmt(investor.coverage.works)}作品`} sub={`女優${fmt(investor.coverage.actresses)} / タグ${fmt(investor.coverage.tags)}`} />
        </div>
      </Section>
    </div>
  )
}
