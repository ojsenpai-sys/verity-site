'use client'

import { useMemo } from 'react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer,
} from 'recharts'
import { ExternalLink } from 'lucide-react'
import { withAffiliate } from '@/lib/affiliate'

export interface AxisScore {
  axis: string
  score: number
  fullMark: number
}

export interface RecommendedProduct {
  id: string
  title: string
  image_url: string | null
  metadataUrl: string | null   // metadata.url — direct DMM URL (non-encoded)
  metadataFloor: string | null // 'videoa' | 'dvdrom'
  slug: string
}

interface Props {
  axisScores: AxisScore[]
  topAxis: string | null
  recommendedProduct: RecommendedProduct | null
}

// Axis-based epithet table
const AXIS_EPITHETS: Record<string, string[]> = {
  '母性・癒やし':     ['母性を貪る孤高の騎士', '豊潤なる慈母の崇拝者', '癒やしの深淵に溺れし者'],
  '刺激・スパルタ':   ['闇夜に潜む調教師', '鬼畜道を往く求道者', '深淵の扉を開けし者'],
  '王道・清純':       ['純潔を崇める求道者', '清廉なる乙女の守護騎士', '無垢なる花園の番人'],
  'ギャル・セクシー': ['夜を制する色香の覇者', '誘惑の蜜に堕ちた探求者', '漆黒の誘惑に溺れし者'],
  'マニアック・企画': ['深淵を覗く異端審問官', '希代のコレクター', '禁断の扉を開けし者'],
}

function pickEpithet(axis: string, scores: AxisScore[]): string {
  const list = AXIS_EPITHETS[axis]
  if (!list) return '未知の探求者'
  const total = scores.reduce((s, a) => s + a.score, 0)
  return list[total % list.length]
}

// ラベルを '・' で2行に分割して描画するカスタムtick
type AnchorType = 'inherit' | 'end' | 'middle' | 'start' | undefined
function AxisTick(props: Record<string, unknown>) {
  const x          = (props.x as number | undefined) ?? 0
  const y          = (props.y as number | undefined) ?? 0
  const textAnchor = ((props.textAnchor as string | undefined) ?? 'middle') as AnchorType
  const value      = (props.payload as { value: string } | undefined)?.value ?? ''
  const dotIdx     = value.indexOf('・')

  const sharedProps = {
    x, y, textAnchor,
    fill: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: 600,
  }

  if (dotIdx < 0) {
    return <text {...sharedProps}>{value}</text>
  }

  const line1 = value.slice(0, dotIdx)
  const line2 = value.slice(dotIdx + 1)
  return (
    <text {...sharedProps}>
      <tspan x={x} dy="-5">{line1}</tspan>
      <tspan x={x} dy="13">{line2}</tspan>
    </text>
  )
}

export function GentlemanAnalysis({ axisScores, topAxis, recommendedProduct }: Props) {
  const hasData = axisScores.some(a => a.score > 0)

  const epithetText = useMemo(() => {
    if (!topAxis) return null
    return pickEpithet(topAxis, axisScores)
  }, [topAxis, axisScores])

  // Use metadata.url (direct, non-encoded) for affiliate link generation
  const affiliateUrl = useMemo(() => {
    if (!recommendedProduct?.metadataUrl) return null
    return withAffiliate(recommendedProduct.metadataUrl)
  }, [recommendedProduct])

  // jp.jpg は全面ジャケットスキャン（表紙位置が不定）のため pl.jpg に統一してプロキシへ渡す
  const proxyImageSrc = useMemo(() => {
    if (!recommendedProduct?.image_url) return null
    const plUrl = recommendedProduct.image_url.replace(/jp\.jpg$/, 'pl.jpg')
    return `/verity/api/proxy/image?url=${encodeURIComponent(plUrl)}`
  }, [recommendedProduct])

  const isVideoa = recommendedProduct?.metadataFloor === 'videoa'
  const sortedAxes = useMemo(
    () => [...axisScores].sort((a, b) => b.score - a.score).filter(a => a.score > 0),
    [axisScores],
  )

  if (!hasData) return null

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <span className="text-base">🎯</span>
          大人の属性カルテ
        </h2>
        <p className="text-[11px] text-[var(--text-muted)]">
          あなたの閲覧行動から導き出した好みの属性分析
        </p>
      </div>

      {/* Radar chart + Epithet side-by-side */}
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Radar chart */}
        <div className="w-full sm:w-60 h-56 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={axisScores} margin={{ top: 22, right: 42, bottom: 22, left: 42 }}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="axis"
                tick={AxisTick}
                tickLine={false}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="score"
                stroke="#E20074"
                fill="#E20074"
                fillOpacity={0.22}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Right: epithet + bar list */}
        <div className="flex-1 space-y-3 text-center sm:text-left">
          {topAxis && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">最強属性</p>
              <span
                className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-black"
                style={{ background: 'rgba(226,0,116,0.12)', borderColor: 'rgba(226,0,116,0.4)', color: '#E20074' }}
              >
                {topAxis}
              </span>
            </div>
          )}

          {epithetText && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
                あなたの現在の称号
              </p>
              <p
                className="text-sm font-black leading-snug"
                style={{
                  background: 'linear-gradient(135deg, #E20074, #ff6eb4, #fbbf24)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                【{epithetText}】
              </p>
            </div>
          )}

          {/* Bar list — top 3 axes */}
          <div className="space-y-1.5">
            {sortedAxes.slice(0, 3).map((a, i) => (
              <div key={a.axis} className="flex items-center gap-2 text-[11px]">
                <span className="w-4 text-right font-mono text-[var(--text-muted)]">{i + 1}</span>
                <span className="min-w-[5rem] text-[var(--text)]">{a.axis}</span>
                <div className="flex-1 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${a.score}%`,
                      background: i === 0
                        ? 'linear-gradient(90deg, #E20074, #ff6eb4)'
                        : 'rgba(226,0,116,0.38)',
                    }}
                  />
                </div>
                <span className="w-7 text-right font-mono text-[var(--text-muted)]">{a.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommended product */}
      {recommendedProduct && affiliateUrl && (
        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
            <span>✨</span>
            今夜のあなたに捧げる「運命の1本」
          </p>

          <div className="flex gap-3 items-start">
            <div className="flex-1 space-y-2 min-w-0">
              <p className="text-xs font-bold text-[var(--text)] line-clamp-3 leading-relaxed">
                {recommendedProduct.title}
              </p>

              <span
                className={[
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider border',
                  isVideoa
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/40'
                    : 'bg-orange-500/12 text-orange-300 border-orange-400/30',
                ].join(' ')}
              >
                {isVideoa ? '動画配信' : 'DVD'}
              </span>

              <a
                href={affiliateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb, #3b82f6)' }}
              >
                <ExternalLink size={13} />
                {isVideoa ? '今すぐ動画を観る' : 'DVDを購入する'}
              </a>
            </div>

            {proxyImageSrc && (
              <div
                className="relative w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--border)]"
                style={{ aspectRatio: '2/3' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxyImageSrc}
                  alt={recommendedProduct.title}
                  className="absolute inset-0 h-full w-full object-cover object-right"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
