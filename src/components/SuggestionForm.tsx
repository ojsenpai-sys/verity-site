'use client'

import { useState } from 'react'
import { Send, CheckCircle } from 'lucide-react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export function SuggestionForm() {
  const [status, setStatus] = useState<Status>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')

    const fd = new FormData(e.currentTarget)
    const payload = {
      actress_name: fd.get('actress_name') as string,
      work_title:   fd.get('work_title')   as string,
      work_id:      fd.get('work_id')      as string,
      comment:      fd.get('comment')      as string,
    }

    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle size={36} className="text-[var(--magenta)]" />
        <p className="font-semibold text-[var(--text)]">ご推薦ありがとうございます！</p>
        <p className="text-sm text-[var(--text-muted)]">編集部が確認し、掲載を検討します。</p>
      </div>
    )
  }

  const inputCls = `w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5
    text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
    focus:border-[var(--magenta)] focus:outline-none transition-colors`

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="sg-actress" className="text-xs font-semibold text-[var(--text-muted)]">
            女優名
          </label>
          <input
            id="sg-actress"
            name="actress_name"
            type="text"
            placeholder="例: 佐々木さき"
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="sg-work-id" className="text-xs font-semibold text-[var(--text-muted)]">
            作品 ID（CID）
          </label>
          <input
            id="sg-work-id"
            name="work_id"
            type="text"
            placeholder="例: ipzz00795"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sg-work-title" className="text-xs font-semibold text-[var(--text-muted)]">
          作品名
        </label>
        <input
          id="sg-work-title"
          name="work_title"
          type="text"
          placeholder="例: ○○○○"
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="sg-comment" className="text-xs font-semibold text-[var(--text-muted)]">
          推薦コメント <span className="text-[var(--magenta)]">*</span>
        </label>
        <textarea
          id="sg-comment"
          name="comment"
          required
          rows={4}
          placeholder="この女優・作品を推薦する理由を教えてください。"
          className={`${inputCls} resize-none`}
        />
      </div>

      {status === 'error' && (
        <p className="text-xs text-red-400">送信に失敗しました。しばらく後にもう一度お試しください。</p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--magenta)]
                   py-2.5 text-sm font-bold text-white
                   shadow-[0_0_18px_rgba(226,0,116,0.35)]
                   hover:brightness-110 disabled:opacity-60 transition-all"
      >
        <Send size={14} />
        {status === 'submitting' ? '送信中…' : '推薦を送る'}
      </button>
    </form>
  )
}
