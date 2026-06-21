'use client'

import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { DailyRow } from '@/lib/adminAnalytics'

type Gran = 'daily' | 'weekly' | 'monthly'

// 期間キー（日=date / 週=その週の月曜 / 月=YYYY-MM）
function periodKey(date: string, g: Gran): string {
  if (g === 'monthly') return date.slice(0, 7)
  if (g === 'weekly') {
    const d = new Date(date + 'T00:00:00Z')
    const dow = (d.getUTCDay() + 6) % 7 // Mon=0
    d.setUTCDate(d.getUTCDate() - dow)
    return d.toISOString().slice(0, 10)
  }
  return date
}

type Point = { label: string; members: number; newUsers: number; favorites: number; events: number; clicks: number }

function rollup(rows: DailyRow[], g: Gran): Point[] {
  const map = new Map<string, Point>()
  for (const r of rows) {
    const k = periodKey(r.date, g)
    const cur = map.get(k) ?? { label: k, members: 0, newUsers: 0, favorites: 0, events: 0, clicks: 0 }
    cur.newUsers += Number(r.new_users) || 0
    cur.favorites += (Number(r.fav_works) || 0) + (Number(r.fav_actresses) || 0)
    cur.events += Number(r.total_events) || 0
    cur.clicks += Number(r.fanza_clicks) || 0
    cur.members = Number(r.total_members) || cur.members // 期間末の累計会員
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => (a.label < b.label ? -1 : 1))
}

const LIME = '#aaff00'
const MAGENTA = '#E20074'
const AMBER = '#fbbf24'
const CYAN = '#22ccff'

function MiniChart({ data, dataKey, color, title }: { data: Point[]; dataKey: keyof Point; color: string; title: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">{title}</p>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#12121a', border: '1px solid #2a2a3a', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#f0f0f8' }}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function AnalyticsCharts({ daily }: { daily: DailyRow[] }) {
  const [gran, setGran] = useState<Gran>('weekly')
  const data = useMemo(() => rollup(daily, gran), [daily, gran])

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(['daily', 'weekly', 'monthly'] as Gran[]).map(g => (
          <button
            key={g}
            onClick={() => setGran(g)}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors"
            style={gran === g
              ? { background: 'rgba(170,255,0,0.12)', color: LIME, border: '1px solid rgba(170,255,0,0.3)' }
              : { color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            {g === 'daily' ? '日別' : g === 'weekly' ? '週別' : '月別'}
          </button>
        ))}
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">データがありません（マイグレーション適用後に集計されます）。</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniChart data={data} dataKey="members"   color={LIME}    title="会員数推移（累計）" />
          <MiniChart data={data} dataKey="favorites" color={MAGENTA} title="お気に入り増加推移" />
          <MiniChart data={data} dataKey="events"    color={CYAN}    title="イベント数推移" />
          <MiniChart data={data} dataKey="clicks"    color={AMBER}   title="FANZAクリック推移" />
        </div>
      )}
    </div>
  )
}
