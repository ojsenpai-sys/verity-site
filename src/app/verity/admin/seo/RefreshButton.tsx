'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function RefreshButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [msg, setMsg]     = useState('')

  async function handleRefresh() {
    setState('loading')
    setMsg('')
    try {
      const res  = await fetch('/verity/api/admin/seo-refresh', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; rows?: number; treasure?: number; isMock?: boolean; error?: string }
      if (!res.ok || data.error) {
        setState('error')
        setMsg(data.error ?? `HTTP ${res.status}`)
        return
      }
      setState('done')
      setMsg(`${data.rows}件取得 / 穴場 ${data.treasure}件${data.isMock ? '（デモ）' : ''}`)
      router.refresh()
    } catch (err) {
      setState('error')
      setMsg(err instanceof Error ? err.message : 'Network error')
    }
  }

  const isLoading = state === 'loading'

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRefresh}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: 'rgba(170,255,0,0.1)', border: '1px solid rgba(170,255,0,0.25)', color: '#aaff00' }}
      >
        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        {isLoading ? 'データ取得中…' : 'データ更新'}
      </button>
      {msg && (
        <span
          className="text-[10px]"
          style={{ color: state === 'error' ? '#ff5533' : '#aaff00' }}
        >
          {state === 'error' ? `⚠ ${msg}` : `✓ ${msg}`}
        </span>
      )}
    </div>
  )
}
