'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, Sparkles, ChevronRight, Loader2 } from 'lucide-react'

const REQUIRED = 10

const NOISE_TAGS = new Set([
  'サンプル動画', 'Blu-ray（ブルーレイ）', 'ハイビジョン', '4K',
  '4時間以上作品', '特典付き・セット商品', 'イメージビデオ',
])
const isNoisyTag = (t: string) =>
  NOISE_TAGS.has(t) || t.includes('VR') || /^\d/.test(t) ||
  t.includes('年代') || t.includes('DOD')

type SampleItem = {
  id:        string
  title:     string
  image_url: string | null
  tags:      string[] | null
}

interface Props {
  onComplete: (genreScores: Record<string, number>) => void
  onSkip:     () => void
}

export function GenreProfilingModal({ onComplete, onSkip }: Props) {
  const [items,    setItems]    = useState<SampleItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [visible,  setVisible]  = useState(false)

  useEffect(() => {
    fetch('/verity/api/genre-scores?mode=sample')
      .then(r => r.json())
      .then(d => {
        setItems(d.items ?? [])
        setLoading(false)
        // フェードイン
        requestAnimationFrame(() => setVisible(true))
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < REQUIRED) {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (selected.size < REQUIRED || saving) return
    setSaving(true)

    const selectedItems = items.filter(i => selected.has(i.id))
    const delta: Record<string, number> = {}
    for (const item of selectedItems) {
      for (const tag of (item.tags ?? [])) {
        if (!isNoisyTag(tag)) {
          delta[tag] = (delta[tag] ?? 0) + 10
        }
      }
    }

    await fetch('/verity/api/genre-scores', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ delta, mark_done: true }),
    }).catch(() => {})

    onComplete(delta)
  }, [selected, items, saving, onComplete])

  const remaining = REQUIRED - selected.size

  return (
    <div
      className={[
        'fixed inset-0 z-[200] flex items-center justify-center p-4',
        'bg-black/80 backdrop-blur-sm transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        className={[
          'relative w-full max-w-3xl max-h-[90dvh] flex flex-col',
          'rounded-2xl border border-[var(--border)]',
          'bg-gradient-to-b from-[var(--surface)] to-[var(--bg)]',
          'shadow-2xl transition-transform duration-300',
          visible ? 'translate-y-0' : 'translate-y-6',
        ].join(' ')}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-purple-600">
              <Sparkles size={15} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black tracking-wide text-[var(--text)]">ジャンル傾向診断</p>
              <p className="text-[10px] text-[var(--text-muted)]">直感で気になる作品を選んでください</p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="rounded-full p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
            aria-label="スキップ"
          >
            <X size={16} />
          </button>
        </div>

        {/* カウンター */}
        <div className="px-6 py-3 shrink-0 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(selected.size / REQUIRED) * 100}%`,
                background: selected.size >= REQUIRED
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #E20074, #ff6eb4)',
              }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: selected.size >= REQUIRED ? '#10b981' : 'var(--text-muted)' }}>
            {selected.size} / {REQUIRED}
          </span>
        </div>

        {/* グリッド */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[var(--magenta)]" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item, idx) => {
                const isSelected = selected.has(item.id)
                const isFull     = selected.size >= REQUIRED && !isSelected
                return (
                  <button
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    disabled={isFull}
                    className={[
                      'relative aspect-[2/3] overflow-hidden rounded-xl border-2 transition-all duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--magenta)]',
                      isSelected
                        ? 'border-[var(--magenta)] shadow-[0_0_12px_rgba(226,0,116,0.5)] scale-[0.97]'
                        : isFull
                          ? 'border-transparent opacity-30 cursor-not-allowed'
                          : 'border-transparent hover:border-[var(--magenta)]/40 hover:scale-[0.98]',
                    ].join(' ')}
                    style={{
                      animationDelay: `${idx * 30}ms`,
                      animation: 'fadeInUp 0.3s ease both',
                    }}
                    aria-pressed={isSelected}
                    aria-label={item.title}
                  >
                    {item.image_url && (
                      <Image
                        src={item.image_url}
                        alt={item.title}
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
                        className="object-cover object-right"
                        loading="lazy"
                      />
                    )}
                    {/* 選択オーバーレイ */}
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[var(--magenta)]/30">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--magenta)] text-white text-xs font-black shadow-lg">
                          ✓
                        </div>
                      </div>
                    )}
                    {/* タイトルグラデーション */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1.5">
                      <p className="line-clamp-2 text-[9px] leading-tight text-white/90">{item.title}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-6 pb-6 pt-3 border-t border-[var(--border)] shrink-0 flex gap-3">
          <button
            onClick={onSkip}
            className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            あとで
          </button>
          <button
            onClick={handleSubmit}
            disabled={selected.size < REQUIRED || saving}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all',
              selected.size >= REQUIRED && !saving
                ? 'bg-gradient-to-r from-[var(--magenta)] to-purple-600 text-white shadow-lg hover:shadow-[0_0_20px_rgba(226,0,116,0.4)] active:scale-[0.98]'
                : 'bg-[var(--surface-2)] text-[var(--text-muted)] cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                {remaining > 0
                  ? `あと ${remaining} 作品選んでください`
                  : '診断結果を確認する'}
                {remaining === 0 && <ChevronRight size={15} />}
              </>
            )}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
