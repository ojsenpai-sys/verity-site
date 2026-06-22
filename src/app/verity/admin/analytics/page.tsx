import type { Metadata } from 'next'
import { BarChart3 } from 'lucide-react'
import {
  getDailyMetrics, getOverview, getEngagement, getFanza, getTags, getPreference, getInvestor,
  getCronStatus, getPreferenceWeights, getAudience, getAudienceV2, getKpiSnapshots, getHumanEngagement,
} from '@/lib/adminAnalytics'
import { AnalyticsCharts } from './AnalyticsCharts'
import { PreferenceWeightsEditor } from './PreferenceWeightsEditor'

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
  // Audience MAU(=distinct session_id) を先に取得し、母集団別の平均指標の分母に使う。
  const [audience, audienceV2, kpiTrend, humanEng] = await Promise.all([getAudience(), getAudienceV2(), getKpiSnapshots(), getHumanEngagement()])
  // Human版（30日/30日）。additive・RPC未適用時は humanEng=null でカード非表示。
  const avgViewsPerHumanAudience = humanEng && humanEng.human_mau > 0 ? Math.round((humanEng.human_work_views / humanEng.human_mau) * 10) / 10 : 0
  const humanSessionDepth        = humanEng && humanEng.human_mau > 0 ? Math.round((humanEng.human_total_events / humanEng.human_mau) * 10) / 10 : 0
  const [overview, engagement, fanza, tags, preference, investor, cron, weights] = await Promise.all([
    getOverview(daily), getEngagement(daily, audience.mau), getFanza(daily), getTags(), getPreference(), getInvestor(daily, audience.mau),
    getCronStatus(), getPreferenceWeights(),
  ])
  const audienceStickiness = audienceV2.mau > 0 ? Math.round((audienceV2.dau / audienceV2.mau) * 1000) / 10 : 0
  const botReduction = audience.mau > 0 ? Math.round((1 - audienceV2.mau / audience.mau) * 1000) / 10 : 0

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

      {/* KPI Trend（観測基盤・日次スナップショット） */}
      {kpiTrend.length > 0 && (
        <Section title="KPI Trend（日次・観測基盤）">
          <p className="-mt-1 text-[11px] text-[var(--text-muted)]">
            ※ <strong className="text-[var(--text)]">kpi_daily_snapshot</strong>（refresh_analytics cron が毎日記録）。7〜14日の推移を観測。最新日が上。
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[760px] text-[11px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-muted)]">
                  <th className="px-2.5 py-1.5 font-semibold">日付</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">会員 計/活</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Aud v2 D/W/M</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Raw MAU</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Pref</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Fav W/A</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">PV</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">VV</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold" style={{ color: '#aaff00' }}>Hum VV</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold">Click</th>
                </tr>
              </thead>
              <tbody>
                {kpiTrend.map(s => (
                  <tr key={s.snapshot_date} className="border-b border-[var(--border)]/40 tabular-nums">
                    <td className="px-2.5 py-1.5 font-semibold text-[var(--text)]">{s.snapshot_date}</td>
                    <td className="px-2.5 py-1.5 text-right">{s.members_total}/{s.members_active}</td>
                    <td className="px-2.5 py-1.5 text-right font-bold" style={{ color: '#aaff00' }}>{s.audience_v2_dau}/{s.audience_v2_wau}/{s.audience_v2_mau}</td>
                    <td className="px-2.5 py-1.5 text-right text-[var(--text-muted)]">{fmt(s.audience_raw_mau)}</td>
                    <td className="px-2.5 py-1.5 text-right">{s.preference_profiles}</td>
                    <td className="px-2.5 py-1.5 text-right">{s.favorite_work_events}/{s.favorite_actress_events}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmt(s.page_view_total)}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmt(s.video_view_total)}</td>
                    <td className="px-2.5 py-1.5 text-right font-bold" style={{ color: '#aaff00' }}>{s.human_work_views != null ? fmt(s.human_work_views) : '—'}</td>
                    <td className="px-2.5 py-1.5 text-right">{fmt(s.fanza_click_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Overview */}
      <Section title="Overview">
        <p className="-mt-1 text-[11px] text-[var(--text-muted)]">
          ※ DAU/WAU/MAU は<strong className="text-[var(--text)]">会員ベース（ログイン済み・JSTカレンダー）</strong>指標。匿名訪問は含みません。
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="総会員数" value={fmt(overview.totalMembers)} />
          <Stat label="新規(今日)" value={fmt(overview.newToday)} />
          <Stat label="新規(7日)" value={fmt(overview.new7d)} />
          <Stat label="新規(30日)" value={fmt(overview.new30d)} />
          <Stat label="ログイン率" value={`${overview.loginRate}%`} sub="Member DAU÷総会員" />
          <Stat label="Member DAU" value={fmt(overview.dau)} sub="当日活動会員" />
          <Stat label="Member WAU" value={fmt(overview.wau)} sub="過去7日" />
          <Stat label="Member MAU" value={fmt(overview.mau)} sub="過去30日" />
          <Stat label="Member Stickiness" value={`${overview.stickiness}%`} sub="DAU÷MAU" />
        </div>
      </Section>

      {/* Audience v2（bot/単発除外後の Human セッション） */}
      <Section title="Audience v2（bot除外）">
        <p className="-mt-1 text-[11px] text-[var(--text-muted)]">
          ※ <strong className="text-[var(--text)]">analytics_v2_audience</strong>：既知bot UA（Googlebot/Bingbot/AhrefsBot/GPTBot/ClaudeBot 等）と
          <strong className="text-[var(--text)]">単発(1イベント=滞在0)セッション</strong>を除外した Human セッション基準。
          {botReduction > 0 && <> 生値から <strong style={{ color: '#fbbf24' }}>−{botReduction}%</strong> を bot/単発として除外。</>}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Audience DAU (v2)" value={fmt(audienceV2.dau)} sub={`生値 ${fmt(audience.dau)}`} />
          <Stat label="Audience WAU (v2)" value={fmt(audienceV2.wau)} sub={`生値 ${fmt(audience.wau)}`} />
          <Stat label="Audience MAU (v2)" value={fmt(audienceV2.mau)} sub={`生値 ${fmt(audience.mau)}`} />
          <Stat label="Audience Stickiness" value={`${audienceStickiness}%`} sub="v2 DAU÷MAU" />
        </div>
      </Section>

      {/* Funnel（登録転換）— データ検証中のため非公開 */}
      <Section title="Funnel（登録転換）">
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>🚧 Data Validation In Progress</p>
          <p className="mx-auto mt-2 max-w-2xl text-[11px] leading-relaxed text-[var(--text-muted)]">
            登録ファネルは現在データ検証中です。<code>signup_start</code> がログイン意図を含む／<code>signup_complete</code> がメール認証のみ計測／OAuth(Google・Twitter)完了が未計測のため、
            事業指標として不正確です。<strong className="text-[var(--text)]">login/signup の分離・Google/Twitter/Email の完了計測</strong>を実装した次フェーズで公開します。
          </p>
        </div>
      </Section>

      {/* Engagement */}
      <Section title="Engagement">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="お気に入り作品数" value={fmt(engagement.favWorks)} />
          <Stat label="お気に入り女優数" value={fmt(engagement.favActresses)} />
          <Stat label="総閲覧履歴数" value={fmt(engagement.totalViews)} sub="作品閲覧（匿名含む）" />
          <Stat label="Avg Views / Audience (RAW)" value={fmt(engagement.avgViewsPerAudience)} sub="RAW総閲覧 ÷ RAW Audience MAU(bot含む)" />
          {humanEng && <Stat label="Avg Views / Human Audience" value={fmt(avgViewsPerHumanAudience)} sub="30日Human閲覧 ÷ 30日Human MAU" />}
          <Stat label="Avg Views / Member" value={fmt(engagement.avgViewsPerMember)} sub="総閲覧 ÷ Member MAU" />
          <Stat label="平均お気に入り/人" value={fmt(engagement.avgFavsPerUser)} sub="お気に入り ÷ 総会員" />
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
                  <img src={proxy(w.image_url)} alt="" className="h-10 w-7 shrink-0 rounded object-cover object-right" />
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
                  <img src={proxy(a.image_url)} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover object-right" />
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
          <Stat label="Member MAU" value={fmt(investor.mau)} />
          <Stat label="Member Stickiness" value={`${investor.stickiness}%`} sub="DAU÷MAU" />
          <Stat label="7日継続率" value={`${investor.retention7d}%`} sub="出戻り率" />
          <Stat label="お気に入り総数" value={fmt(investor.favoriteTotal)} />
          <Stat label="Favorite Utilization" value={`${investor.favoriteUtilization}%`} sub="行動会員比率" />
          <Stat label="作品保存率" value={`${investor.workSaveRate}%`} />
          <Stat label="女優フォロー率" value={`${investor.actressFollowRate}%`} />
          <Stat label="月間イベント数" value={fmt(investor.monthlyEvents)} />
          <Stat label="Avg Session Depth (RAW)" value={fmt(investor.avgSessionDepth)} sub="RAW総イベント ÷ RAW Session数(bot含む)" />
          {humanEng && <Stat label="Human Session Depth" value={fmt(humanSessionDepth)} sub="30日Humanイベント ÷ 30日Human MAU" />}
          <Stat label="FANZA送客数" value={fmt(investor.fanzaReferrals)} sub="累計" />
          <Stat label="FANZA送客率" value={`${investor.fanzaCtr}%`} sub="clicks÷作品閲覧" />
          <Stat label="Content Coverage" value={`${fmt(investor.coverage.works)}作品`} sub={`女優${fmt(investor.coverage.actresses)} / タグ${fmt(investor.coverage.tags)}`} />
        </div>
      </Section>

      {/* Cron Status */}
      <Section title="Cron Status（集計鮮度）">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="px-3 py-2 text-left font-semibold">Job</th>
                <th className="px-3 py-2 text-left font-semibold">最終実行</th>
                <th className="px-3 py-2 text-left font-semibold">状態</th>
                <th className="px-3 py-2 text-right font-semibold">実行時間</th>
              </tr>
            </thead>
            <tbody>
              {cron.map(j => (
                <tr key={j.job_name} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2 font-mono text-[var(--text)]">{j.job_name}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{j.started_at ? new Date(j.started_at).toLocaleString('ja-JP') : '—'}</td>
                  <td className="px-3 py-2">
                    <span style={{ color: j.status === 'ok' ? '#aaff00' : j.status === 'error' ? '#ff5533' : 'var(--text-muted)' }}>
                      {j.status === 'ok' ? '✓ 成功' : j.status === 'error' ? '✗ 失敗' : (j.status ?? '実行中')}
                    </span>
                    {j.error && <span className="ml-2 text-[10px] text-[#ff5533]">{j.error.slice(0, 60)}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{j.duration_ms != null ? `${fmt(j.duration_ms)}ms` : '—'}</td>
                </tr>
              ))}
              {cron.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-3 text-[var(--text-muted)]">実行履歴なし（refresh_* 実行後に表示）</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Preference Weights（嗜好スコアの重み調整） */}
      <Section title="Preference Weights（嗜好スコア重み）">
        <PreferenceWeightsEditor initial={weights} />
      </Section>
    </div>
  )
}
