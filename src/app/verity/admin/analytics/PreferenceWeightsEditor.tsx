'use client'

import { useState } from 'react'
import type { WeightRow } from '@/lib/adminAnalytics'

const LABELS: Record<string, string> = {
  video_view: '作品閲覧 (view_work)',
  favorite_work: 'お気に入り作品 (favorite_work)',
  fanza_click: 'FANZAクリック (click_fanza)',
}

export function PreferenceWeightsEditor({ initial }: { initial: WeightRow[] }) {
  const [rows, setRows] = useState<WeightRow[]>(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const setWeight = (event_name: string, v: string) =>
    setRows(rs => rs.map(r => r.event_name === event_name ? { ...r, weight: Number(v) } : r))

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/verity/api/admin/preference-weights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weights: rows }),
      })
      const j = await res.json()
      setMsg(res.ok ? `✓ 保存しました（${j.updated}件）。嗜好プロファイル再計算: ${j.refreshed ? 'OK' : '失敗 ' + (j.refreshError ?? '')}` : `✗ ${j.error ?? '失敗'}`)
    } catch (e) {
      setMsg('✗ ' + (e as Error).message)
    } finally { setSaving(false) }
  }

  if (rows.length === 0) return <p className="text-[11px] text-[var(--text-muted)]">preference_weights が未取得です。</p>

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[11px] text-[var(--text-muted)]">行動由来の嗜好スコアの重み。変更すると保存時に <code>refresh_user_profiles()</code> が走り全プロファイル再計算されます。</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.event_name} className="flex items-center gap-3">
            <span className="flex-1 text-xs text-[var(--text)]">{LABELS[r.event_name] ?? r.event_name}</span>
            <input
              type="number" min={0} step={0.5} value={r.weight}
              onChange={e => setWeight(r.event_name, e.target.value)}
              className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--text)] tabular-nums"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save} disabled={saving}
          className="rounded-lg px-4 py-2 text-xs font-bold disabled:opacity-50"
          style={{ background: 'rgba(170,255,0,0.12)', color: '#aaff00', border: '1px solid rgba(170,255,0,0.3)' }}
        >
          {saving ? '保存中…' : '保存して再計算'}
        </button>
        {msg && <span className="text-[11px] text-[var(--text-muted)]">{msg}</span>}
      </div>
    </div>
  )
}
