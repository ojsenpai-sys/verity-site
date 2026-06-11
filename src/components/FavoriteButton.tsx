'use client'

import { useCallback, useState } from 'react'
import { Heart, X } from 'lucide-react'
import Link from 'next/link'
import { useFavorite } from '@/hooks/useFavorite'
import { useAuth } from '@/components/AuthProvider'
import { trackEvent } from '@/lib/analytics'
import type { FavType, FavMeta } from '@/hooks/useFavorite'

type Props = {
  type:       FavType
  id:         string      // externalId for actress, slug/id for article
  meta?:      FavMeta     // { title, href } stored in localStorage for display
  className?: string
  size?:      'sm' | 'md'
}

export function FavoriteButton({ type, id, meta, className, size = 'sm' }: Props) {
  const { isFavorited, toggle } = useFavorite(type)
  const { user }                = useAuth()
  const faved                   = isFavorited(id)
  const dim                     = size === 'md' ? 36 : 28
  const iconSize                = size === 'md' ? 16 : 13
  const [showModal, setShowModal] = useState(false)

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      window.dispatchEvent(new Event('verity:auth-required'))
      setShowModal(true)
      return
    }

    toggle(id, meta)

    if (type === 'actress') {
      fetch('/verity/api/favorites/actress', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ external_id: id, action: faved ? 'remove' : 'add' }),
      }).catch(() => {})
    }
  }, [toggle, id, meta, user, type, faved])

  return (
    <>
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--surface)', border: '1px solid rgba(226,0,116,0.35)', boxShadow: '0 0 40px rgba(226,0,116,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-base font-black text-[var(--text)]">お気に入り機能は<br />無料会員限定です</p>
                <p className="text-sm text-[var(--text-muted)]">今なら <strong className="text-amber-400">30 LP</strong> 貰えるキャンペーン中 🎁</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="shrink-0 rounded-full p-1 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              無料登録するだけで推し女優をお気に入り登録できます。毎日ログインで LP が貯まります。
            </p>
            <Link
              href="/verity/login"
              className="block w-full rounded-xl py-3 text-center text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #E20074, #aa00ff)' }}
              onClick={() => {
                trackEvent('signup_start', { position: 'actress_fav_lock' })
                setShowModal(false)
              }}
            >
              無料で登録する ▶
            </Link>
          </div>
        </div>
      )}
      <button
      onClick={handleClick}
      aria-label={faved ? 'お気に入りを解除' : 'お気に入りに追加'}
      style={{
        width:        dim,
        height:       dim,
        borderRadius: '50%',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        flexShrink:   0,
        transition:   'all 0.2s ease',
        background:   faved ? 'rgba(226,0,116,0.18)' : 'rgba(0,0,0,0.45)',
        border:       faved ? '1px solid rgba(226,0,116,0.55)' : '1px solid rgba(255,255,255,0.12)',
        boxShadow:    faved ? '0 0 14px rgba(226,0,116,0.55), 0 0 28px rgba(226,0,116,0.2)' : 'none',
        color:        faved ? '#E20074' : 'rgba(255,255,255,0.55)',
        cursor:       'pointer',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      className={className}
      onMouseEnter={e => {
        if (!faved) {
          const t = e.currentTarget as HTMLButtonElement
          t.style.background = 'rgba(226,0,116,0.15)'
          t.style.color      = '#E20074'
          t.style.border     = '1px solid rgba(226,0,116,0.4)'
        }
      }}
      onMouseLeave={e => {
        if (!faved) {
          const t = e.currentTarget as HTMLButtonElement
          t.style.background = 'rgba(0,0,0,0.45)'
          t.style.color      = 'rgba(255,255,255,0.55)'
          t.style.border     = '1px solid rgba(255,255,255,0.12)'
        }
      }}
    >
      <Heart
        size={iconSize}
        style={{
          fill:       faved ? '#E20074' : 'none',
          filter:     faved ? 'drop-shadow(0 0 4px rgba(226,0,116,0.9))' : 'none',
          transition: 'all 0.2s ease',
        }}
      />
    </button>
    </>
  )
}
