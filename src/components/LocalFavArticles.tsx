'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart, ExternalLink, X } from 'lucide-react'
import { readArticleMeta } from '@/hooks/useFavorite'
import type { FavMeta } from '@/hooks/useFavorite'

const FAV_ARTICLES_KEY = 'verity_fav_articles'
const META_KEY         = 'verity_fav_articles_meta'

const CONFIRM_TEXTS = {
  ja: 'この作品をお気に入りから削除しますか？',
  en: 'Remove this item from your favorites?',
  th: 'ลบรายการนี้ออกจากรายการโปรดของคุณหรือไม่?',
} as const

function detectLang(): keyof typeof CONFIRM_TEXTS {
  if (typeof navigator === 'undefined') return 'ja'
  const bl = navigator.language.toLowerCase()
  if (bl.startsWith('th')) return 'th'
  if (bl.startsWith('en')) return 'en'
  return 'ja'
}

function readIds(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_ARTICLES_KEY) ?? '[]') } catch { return [] }
}

function removeId(id: string) {
  const current = readIds()
  const next    = current.filter(s => s !== id)
  localStorage.setItem(FAV_ARTICLES_KEY, JSON.stringify(next))
  // 匿名LSのみの除去は真実源(DB)外のためイベント対象外（ログイン同期時に RPC で計上）

  // Remove from meta map too
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Record<string, FavMeta>
    delete meta[id]
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch { /* ignore */ }

  window.dispatchEvent(new Event('verity:fav-changed'))
}

// ── 確認ダイアログモーダル ─────────────────────────────────────────────────

type ConfirmProps = {
  message:   string
  onConfirm: () => void
  onCancel:  () => void
}

function ConfirmModal({ message, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-xs rounded-2xl p-6 space-y-5"
        style={{
          background: 'linear-gradient(145deg, #161624, #1e1e30)',
          border:     '1px solid rgba(226,0,116,0.35)',
          boxShadow:  '0 0 40px rgba(226,0,116,0.12), 0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <X size={15} />
        </button>

        <div className="flex items-center gap-2.5">
          <Heart size={15} style={{ color: '#E20074' }} />
          <p className="text-sm font-semibold text-[var(--text)] leading-snug pr-4">
            {message}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg py-2 text-xs font-bold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #E20074, #ff2d55)',
              boxShadow:  '0 0 12px rgba(226,0,116,0.3)',
            }}
          >
            削除する
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[var(--border)] py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--magenta)]/40 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

// ── メインコンポーネント ───────────────────────────────────────────────────

export function LocalFavArticles() {
  const [ids, setIds]             = useState<string[]>([])
  const [meta, setMeta]           = useState<Record<string, FavMeta>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    setIds(readIds())
    setMeta(readArticleMeta())

    function sync() {
      setIds(readIds())
      setMeta(readArticleMeta())
    }
    window.addEventListener('verity:fav-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('verity:fav-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (ids.length === 0) return null

  const confirmText = CONFIRM_TEXTS[detectLang()]

  function handleRemoveClick(id: string) {
    setPendingId(id)
  }

  function confirmRemove() {
    if (!pendingId) return
    removeId(pendingId)
    setPendingId(null)
  }

  return (
    <>
      {pendingId && (
        <ConfirmModal
          message={confirmText}
          onConfirm={confirmRemove}
          onCancel={() => setPendingId(null)}
        />
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Heart size={14} style={{ fill: '#E20074', color: '#E20074' }} />
          <h2 className="text-sm font-bold text-[var(--text)]">お気に入り記事・作品</h2>
          <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
            {ids.length}件
          </span>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {ids.map(id => {
            const info  = meta[id]
            const title = info?.title ?? id
            const href  = info?.href  ?? ''

            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3 min-w-0">
                {href ? (
                  <Link
                    href={href}
                    className="flex-1 min-w-0 flex items-center gap-2 group"
                  >
                    <ExternalLink size={11} className="shrink-0 text-[var(--text-muted)] group-hover:text-[var(--magenta)] transition-colors" />
                    <span className="truncate text-sm text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors leading-tight">
                      {title}
                    </span>
                  </Link>
                ) : (
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <ExternalLink size={11} className="shrink-0 text-[var(--text-muted)]" />
                    <span className="truncate text-sm text-[var(--text-muted)] leading-tight">{title}</span>
                  </div>
                )}

                <button
                  onClick={() => handleRemoveClick(id)}
                  className="shrink-0 rounded-full p-1.5 transition-all"
                  style={{ color: 'rgba(226,0,116,0.5)' }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = '#E20074'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(226,0,116,0.1)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(226,0,116,0.5)'
                    ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                  }}
                  aria-label="お気に入りから削除"
                >
                  <Heart size={13} style={{ fill: 'currentColor' }} />
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-[var(--text-muted)]">
          * このデバイスにローカル保存されています
        </p>
      </section>
    </>
  )
}
