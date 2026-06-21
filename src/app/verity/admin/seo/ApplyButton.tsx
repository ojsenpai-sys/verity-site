'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Zap } from 'lucide-react'

type Props = {
  suggestionId?: string   // キャッシュなし（ライブAPIデータ）では undefined になり得る
  actressId:     string
  title:         string
  isApplied?:    boolean
}

export function ApplyButton({ suggestionId, actressId, title, isApplied }: Props) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    isApplied ? 'done' : 'idle'
  )

  async function handleApply() {
    if (state === 'done') return
    // ③ ローカル環境での誤適用防止
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      const ok = window.confirm(
        '⚠ 現在はローカル環境です。\n\n「OK」を押すと本番DB（verity-official.com）に直接反映されます。\n本番ドメインの管理画面から操作することをお勧めします。\n\n続行しますか？'
      )
      if (!ok) return
    }
    setState('loading')
    try {
      const res = await fetch('/verity/api/admin/seo-apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ actressId, title, ...(suggestionId ? { suggestionId } : {}) }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || data.error) {
        setState('error')
        setTimeout(() => setState('idle'), 3000)
        return
      }
      setState('done')
      router.refresh()
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  if (state === 'done') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-bold"
        style={{ background: 'rgba(170,255,0,0.08)', border: '1px solid rgba(170,255,0,0.2)', color: '#aaff00' }}
      >
        <Check size={11} />
        適用済み
      </span>
    )
  }

  return (
    <button
      onClick={handleApply}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
      style={
        state === 'error'
          ? { background: 'rgba(255,85,51,0.1)', border: '1px solid rgba(255,85,51,0.25)', color: '#ff5533' }
          : { background: 'rgba(170,255,0,0.1)', border: '1px solid rgba(170,255,0,0.25)', color: '#aaff00' }
      }
    >
      {state === 'loading'
        ? <Loader2 size={11} className="animate-spin" />
        : state === 'error'
        ? '⚠ 失敗'
        : <Zap size={11} />}
      {state === 'loading' ? '適用中…' : state === 'error' ? 'リトライ' : 'タイトル適用'}
    </button>
  )
}
