export const dynamic   = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { getGA4RealtimeData, TARGET_EVENTS } from '@/lib/ga4Realtime'
import type { TargetEvent } from '@/lib/ga4Realtime'
import { RefreshTicker } from './RefreshTicker'

export const metadata: Metadata = { title: 'GA4 Debug — VERITY Admin' }

// ── 定数 ──────────────────────────────────────────────────────────────────────

const EVENT_META: Record<TargetEvent, { label: string; color: string; bg: string }> = {
  page_view:    { label: 'ページ閲覧',    color: '#aaff00', bg: 'rgba(170,255,0,0.08)'    },
  actress_view: { label: '女優閲覧',      color: '#22ccff', bg: 'rgba(34,204,255,0.08)'  },
  video_view:   { label: '作品閲覧',      color: '#aa77ff', bg: 'rgba(170,119,255,0.08)' },
  fanza_click:  { label: 'FANZAクリック', color: '#ff5533', bg: 'rgba(255,85,51,0.08)'   },
}

const FUNNEL_STEPS: { from: TargetEvent; to: TargetEvent; label: string }[] = [
  { from: 'page_view',    to: 'actress_view', label: 'page_view → actress_view' },
  { from: 'actress_view', to: 'video_view',   label: 'actress_view → video_view' },
  { from: 'video_view',   to: 'fanza_click',  label: 'video_view → fanza_click' },
]

// ── ユーティリティ ─────────────────────────────────────────────────────────────

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : 0
}

function convColor(rate: number): string {
  if (rate >= 30) return '#aaff00'
  if (rate >= 15) return '#fbbf24'
  return '#ff5533'
}

// ── ページ ────────────────────────────────────────────────────────────────────

export default async function GA4DebugPage() {
  const { events, isMock, fetchedAt } = await getGA4RealtimeData()

  const counts = TARGET_EVENTS.map(e => ({ event: e, count: events[e] ?? 0 }))
  const pvCount = events.page_view ?? 0
  const maxCount = Math.max(...counts.map(c => c.count), 1)

  return (
    <div className="space-y-8 px-6 py-6 max-w-4xl">

      {/* ── ヘッダー ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-black tracking-wide" style={{ color: '#aaff00' }}>
            GA4 Debug
          </h1>
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase"
            style={{ background: 'rgba(34,204,255,0.12)', border: '1px solid rgba(34,204,255,0.35)', color: '#22ccff' }}
          >
            直近 30 分
          </span>
          {isMock && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}
            >
              DEMO DATA
            </span>
          )}
        </div>
        <RefreshTicker fetchedAt={fetchedAt} />
        {isMock && (
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
            本番データを表示するには <code className="text-amber-400/80">GOOGLE_GA4_PROPERTY_ID</code> と{' '}
            <code className="text-amber-400/80">GOOGLE_GA4_SERVICE_ACCOUNT_JSON</code> を設定してください。
          </p>
        )}
      </div>

      {/* ── イベントカード ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counts.map(({ event, count }, i) => {
          const meta  = EVENT_META[event]
          const pvPct = pct(count, pvCount)
          const prev  = i > 0 ? (events[counts[i - 1].event] ?? 0) : null
          const stepPct = prev !== null ? pct(count, prev) : null

          return (
            <div
              key={event}
              className="rounded-xl p-4 space-y-2"
              style={{ background: meta.bg, border: `1px solid ${meta.color}22` }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
                {event}
              </p>
              <p className="text-3xl font-black font-mono" style={{ color: meta.color }}>
                {count.toLocaleString()}
              </p>
              <div className="space-y-0.5">
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {meta.label}
                </p>
                {i === 0 ? (
                  <p className="text-[11px] font-semibold" style={{ color: meta.color }}>
                    基準 (100%)
                  </p>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-[11px]" style={{ color: convColor(stepPct ?? 0) }}>
                      step ↓ {stepPct}%
                    </p>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      対 PV {pvPct}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── ファネル可視化 ────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 space-y-1"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
          ファネル可視化 — 直近 30 分
        </p>

        {counts.map(({ event, count }, i) => {
          const meta    = EVENT_META[event]
          const barPct  = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 2 : 0) : 0
          const pvPct   = pct(count, pvCount)
          const stepData = i > 0 ? FUNNEL_STEPS[i - 1] : null
          const prevCount = i > 0 ? (events[counts[i - 1].event] ?? 0) : null
          const stepRate  = prevCount !== null ? pct(count, prevCount) : null
          const dropRate  = stepRate !== null ? Math.round((100 - stepRate) * 10) / 10 : null

          return (
            <div key={event}>
              {/* ステップ間の変換矢印 */}
              {stepData && stepRate !== null && (
                <div className="flex items-center gap-3 py-2 pl-2">
                  <div className="w-1 self-stretch" style={{ background: `${convColor(stepRate)}33` }} />
                  <div className="flex items-center gap-2 text-[11px]">
                    <span style={{ color: convColor(stepRate) }}>
                      ↓ {stepRate}% 到達
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>
                      / {dropRate}% 離脱
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
                      style={{
                        background: `${convColor(stepRate)}18`,
                        color:      convColor(stepRate),
                        border:     `1px solid ${convColor(stepRate)}33`,
                      }}
                    >
                      {stepData.label}
                    </span>
                  </div>
                </div>
              )}

              {/* イベント行 */}
              <div className="flex items-center gap-3 group">
                {/* イベント名 */}
                <div className="w-28 shrink-0">
                  <p className="text-[10px] font-bold" style={{ color: meta.color }}>{event}</p>
                </div>

                {/* バー */}
                <div className="flex-1 relative h-7 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                    style={{
                      width:      `${barPct}%`,
                      background: `linear-gradient(90deg, ${meta.color}cc, ${meta.color}55)`,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center px-2.5 gap-2">
                    <span className="text-xs font-black font-mono" style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                      {count.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* 割合 */}
                <div className="w-16 shrink-0 text-right space-y-0.5">
                  {i === 0 ? (
                    <p className="text-xs font-bold" style={{ color: meta.color }}>100%</p>
                  ) : (
                    <>
                      <p className="text-xs font-bold" style={{ color: convColor(pvPct) }}>{pvPct}%</p>
                      <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>対 PV</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── ステップ別変換サマリー ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {FUNNEL_STEPS.map(({ from, to, label }) => {
          const fromCount = events[from] ?? 0
          const toCount   = events[to]   ?? 0
          const rate      = pct(toCount, fromCount)
          const drop      = Math.round((100 - rate) * 10) / 10
          const col       = convColor(rate)

          return (
            <div
              key={label}
              className="rounded-xl p-4 space-y-2"
              style={{ background: 'var(--surface)', border: `1px solid ${col}22` }}
            >
              <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {label}
              </p>
              <p className="text-2xl font-black font-mono" style={{ color: col }}>
                {rate}%
              </p>
              <div className="space-y-0.5 text-[11px]">
                <p style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {fromCount.toLocaleString()} → {toCount.toLocaleString()}
                </p>
                <p style={{ color: 'rgba(255,85,51,0.7)' }}>
                  {drop}% 離脱 ({(fromCount - toCount).toLocaleString()}件)
                </p>
              </div>
              {/* ミニバー */}
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(rate, 100)}%`, background: col }} />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
