'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Send, ExternalLink, AlertTriangle, Check } from 'lucide-react'
import {
  listSocialPosts, markSocialPostPosted, updateSocialPostMetrics,
} from '@/app/verity/actions/admin-social-posts'
import type { SocialPostRow } from '@/lib/social/types'

const TYPE_LABEL: Record<string, string> = {
  ranking: '人気ランキング', actress_trending: '女優', new_releases: '新作', sale: 'セール',
}
const STATUS_LABEL: Record<string, string> = { draft: '下書き', posted: '投稿済み', archived: 'アーカイブ' }

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

type Edit = { impressions: string; likes: string; reposts: string }

export default function HistoryPanel() {
  const [rows, setRows]       = useState<SocialPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [edits, setEdits]     = useState<Record<string, Edit>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await listSocialPosts(50)
    setLoading(false)
    if (res.ok) setRows(res.rows)
    else setError(res.error)
  }, [])

  useEffect(() => { void load() }, [load])

  function editVal(r: SocialPostRow, k: keyof Edit): string {
    return edits[r.id]?.[k] ?? (r[k] == null ? '' : String(r[k]))
  }
  function setEdit(id: string, k: keyof Edit, v: string) {
    setEdits((p) => ({ ...p, [id]: { ...(p[id] ?? { impressions: '', likes: '', reposts: '' }), [k]: v } }))
  }

  async function handleMarkPosted(id: string) {
    const url = window.prompt('XのツイートURL（任意・空でも可）を入力してください。キャンセルで中止。', '')
    if (url === null) return
    setBusyId(id)
    const res = await markSocialPostPosted(id, url || undefined)
    setBusyId(null)
    if (!res.ok) { setError(res.error ?? '更新に失敗しました'); return }
    await load()
  }

  async function handleUpdateMetrics(r: SocialPostRow) {
    const num = (s: string) => (s.trim() === '' ? null : Number(s))
    setBusyId(r.id)
    const res = await updateSocialPostMetrics(r.id, {
      impressions: num(editVal(r, 'impressions')),
      likes:       num(editVal(r, 'likes')),
      reposts:     num(editVal(r, 'reposts')),
    })
    setBusyId(null)
    if (!res.ok) { setError(res.error ?? '更新に失敗しました'); return }
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          投稿履歴と成果（成果は <strong>投稿済みにした時刻(posted_at)以降</strong>のみ集計）
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--magenta)]"
        >
          <RefreshCw size={13} /> 更新
        </button>
      </div>

      {error && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
            error.includes('mig040')
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-400'
              : 'border-red-500/30 bg-red-500/5 text-red-400'
          }`}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 p-6 text-sm text-[var(--text-muted)]">
          <Loader2 size={15} className="animate-spin" /> 読み込み中…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          保存済みの投稿はありません。「生成」タブで作成し「履歴に保存」してください。
        </p>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            {/* ヘッダ */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--magenta)]/12 px-2 py-0.5 text-[11px] font-bold text-[var(--magenta)]">
                {TYPE_LABEL[r.post_type] ?? r.post_type}
              </span>
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)]">
                {r.lang}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                r.status === 'posted' ? 'bg-emerald-500/15 text-emerald-400'
                : r.status === 'archived' ? 'bg-[var(--surface-2)] text-[var(--text-muted)]'
                : 'bg-amber-500/15 text-amber-400'
              }`}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
              <span className="ml-auto text-[11px] text-[var(--text-muted)]">
                {r.status === 'posted' ? `投稿 ${fmt(r.posted_at)}` : `作成 ${fmt(r.created_at)}`}
              </span>
            </div>

            {/* 本文抜粋 */}
            <p className="whitespace-pre-wrap break-words rounded-lg bg-[var(--surface-2)] p-2.5 text-xs leading-relaxed text-[var(--text)] line-clamp-4">
              {r.body}
            </p>

            {/* リンク */}
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              {r.url && (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--magenta)]">
                  <ExternalLink size={11} /> サイトURL(vp付)
                </a>
              )}
              {r.tweet_url && (
                <a href={r.tweet_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--magenta)]">
                  <ExternalLink size={11} /> Xの投稿
                </a>
              )}
              <span className="text-[var(--text-muted)] opacity-60">vp={r.track_code}</span>
            </div>

            {/* 成果（posted_at以降） */}
            {r.status === 'posted' && r.attributed && (
              <div className="grid grid-cols-4 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-center">
                <Metric label="送客" value={r.attributed.fanzaClick} accent />
                <Metric label="PV" value={r.attributed.pageView} />
                <Metric label="登録" value={r.attributed.signup} />
                <Metric label="訪問数" value={r.attributed.sessions} />
              </div>
            )}

            {/* 操作 */}
            <div className="flex flex-wrap items-end gap-3 border-t border-[var(--border)] pt-3">
              {r.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => handleMarkPosted(r.id)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-bold text-black transition-all active:scale-95 disabled:opacity-60"
                >
                  {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  投稿済みにする
                </button>
              )}

              {/* X手入力指標 */}
              <NumField label="インプレ" value={editVal(r, 'impressions')} onChange={(v) => setEdit(r.id, 'impressions', v)} />
              <NumField label="いいね"   value={editVal(r, 'likes')}       onChange={(v) => setEdit(r.id, 'likes', v)} />
              <NumField label="リポスト" value={editVal(r, 'reposts')}     onChange={(v) => setEdit(r.id, 'reposts', v)} />
              <button
                type="button"
                onClick={() => handleUpdateMetrics(r)}
                disabled={busyId === r.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--magenta)]/40 px-3 py-2 text-xs font-bold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/10 active:scale-95 disabled:opacity-60"
              >
                {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                指標を更新
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-[var(--magenta)]' : 'text-[var(--text)]'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm tabular-nums text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--magenta)]"
      />
    </label>
  )
}
