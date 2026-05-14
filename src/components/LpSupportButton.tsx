'use client'

import { useState } from 'react'
import { Heart, Loader2, Sparkles } from 'lucide-react'

type Props = {
  actressId:   string   // UUID from actresses.id
  actressName: string
}

type ApiResult = {
  new_balance?:     number
  assigned_lp?:     number
  error?:           string
}

export function LpSupportButton({ actressId, actressName }: Props) {
  const [open,    setOpen]    = useState(false)
  const [amount,  setAmount]  = useState(5)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<ApiResult | null>(null)

  async function handleSend() {
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch('/verity/api/lp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ actress_id: actressId, amount }),
      })
      const data = await res.json() as ApiResult
      setResult(data)
      if (!data.error) {
        setTimeout(() => { setOpen(false); setResult(null) }, 2000)
      }
    } catch {
      setResult({ error: '通信エラーが発生しました' })
    } finally {
      setLoading(false)
    }
  }

  const PRESETS = [1, 5, 10, 30]

  const errorMsg = result?.error === 'actress_not_in_favorites'
    ? `${actressName}をお気に入りに追加してから応援できます`
    : result?.error === 'insufficient_balance'
    ? 'LP残高が不足しています'
    : result?.error

  return (
    <>
      <button
        onClick={() => { setOpen(true); setResult(null) }}
        className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--magenta)]/50 bg-[var(--surface)] px-6 py-3 text-sm font-bold text-[var(--magenta)] shadow-[0_0_16px_rgba(226,0,116,0.15)] hover:border-[var(--magenta)] hover:shadow-[0_0_24px_rgba(226,0,116,0.3)] active:scale-95 transition-all"
      >
        <Heart size={15} className="fill-[var(--magenta)]" />
        {actressName}を応援する（LP）
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--magenta)]/30 bg-[var(--surface)] p-6 space-y-5 shadow-[0_0_60px_rgba(226,0,116,0.2)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-[var(--magenta)]" />
              <h3 className="font-bold text-[var(--text)]">{actressName}へ LP を送る</h3>
            </div>

            {/* プリセット */}
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                    amount === p
                      ? 'bg-[var(--magenta)] text-white shadow-[0_0_12px_rgba(226,0,116,0.4)]'
                      : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)]/50'
                  }`}
                >
                  {p} LP
                </button>
              ))}
            </div>

            {/* カスタム入力 */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={amount}
                onChange={e => setAmount(Math.max(1, Math.min(100, Number(e.target.value))))}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-center text-lg font-bold text-[var(--text)] focus:border-[var(--magenta)] focus:outline-none"
              />
              <span className="shrink-0 text-sm text-[var(--text-muted)]">LP</span>
            </div>

            {/* 結果表示 */}
            {result && (
              <div className={`rounded-xl px-4 py-3 text-sm ${
                result.error
                  ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                  : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}>
                {result.error
                  ? errorMsg
                  : `✓ 送信しました！残高: ${result.new_balance} LP`
                }
              </div>
            )}

            {/* 送信ボタン */}
            <button
              onClick={handleSend}
              disabled={loading}
              className="w-full rounded-xl bg-[var(--magenta)] py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(226,0,116,0.3)] hover:brightness-110 active:scale-95 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {loading
                ? <Loader2 size={16} className="animate-spin" />
                : <Heart size={15} className="fill-white" />
              }
              {loading ? '送信中...' : `${amount} LP を送る`}
            </button>

            <p className="text-center text-[10px] text-[var(--text-muted)]">
              ※ お気に入り登録済みの女優にのみ送れます
            </p>
          </div>
        </div>
      )}
    </>
  )
}
