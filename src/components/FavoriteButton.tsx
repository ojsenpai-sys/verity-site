'use client'

import { useCallback } from 'react'
import { Heart } from 'lucide-react'
import { useFavorite } from '@/hooks/useFavorite'
import { useAuth } from '@/components/AuthProvider'
import type { FavType } from '@/hooks/useFavorite'

type Props = {
  type:      FavType
  id:        string        // externalId for actress, slug for article
  className?: string
  size?:     'sm' | 'md'
}

export function FavoriteButton({ type, id, className, size = 'sm' }: Props) {
  const { isFavorited, toggle } = useFavorite(type)
  const { user }                = useAuth()
  const faved                   = isFavorited(id)
  const dim                     = size === 'md' ? 36 : 28
  const iconSize                = size === 'md' ? 16 : 13

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggle(id)

    // Best-effort Supabase sync for logged-in users (actresses only)
    if (user && type === 'actress') {
      fetch('/verity/api/favorites/actress', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ external_id: id, action: faved ? 'remove' : 'add' }),
      }).catch(() => {})
    }
  }, [toggle, id, user, type, faved])

  return (
    <button
      onClick={handleClick}
      aria-label={faved ? 'お気に入りを解除' : 'お気に入りに追加'}
      style={{
        width:       dim,
        height:      dim,
        borderRadius: '50%',
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
        flexShrink:  0,
        transition:  'all 0.2s ease',
        background:  faved ? 'rgba(226,0,116,0.18)' : 'rgba(0,0,0,0.45)',
        border:      faved ? '1px solid rgba(226,0,116,0.55)' : '1px solid rgba(255,255,255,0.12)',
        boxShadow:   faved ? '0 0 14px rgba(226,0,116,0.55), 0 0 28px rgba(226,0,116,0.2)' : 'none',
        color:       faved ? '#E20074' : 'rgba(255,255,255,0.55)',
        cursor:      'pointer',
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
  )
}
