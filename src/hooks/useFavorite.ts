'use client'

import { useCallback, useEffect, useState } from 'react'

export type FavType = 'actress' | 'article'

const LS_KEYS: Record<FavType, string> = {
  actress: 'verity_fav_actresses',
  article: 'verity_fav_articles',
}

const FAV_CHANGED = 'verity:fav-changed'

function safeRead(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

function safeWrite(key: string, val: string[]) {
  localStorage.setItem(key, JSON.stringify(val))
  window.dispatchEvent(new Event(FAV_CHANGED))
}

export function useFavorite(type: FavType) {
  const key = LS_KEYS[type]

  // Start with [] so SSR and hydration both render the same empty state.
  // After mount, sync to localStorage and subscribe to cross-component changes.
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    setIds(safeRead(key))

    function sync() { setIds(safeRead(key)) }
    window.addEventListener(FAV_CHANGED, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(FAV_CHANGED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [key])

  const toggle = useCallback((id: string) => {
    const current = safeRead(key)
    const isAdding = !current.includes(id)
    const next = isAdding ? [...current, id] : current.filter(x => x !== id)
    safeWrite(key, next)
    setIds(next)
    if (isAdding) {
      window.dispatchEvent(new CustomEvent('verity:fav-added', { detail: { type, id } }))
    }
  }, [key, type])

  const isFavorited = useCallback((id: string) => ids.includes(id), [ids])

  return { isFavorited, toggle, ids }
}

export function getTotalFavCount(): number {
  if (typeof window === 'undefined') return 0
  return safeRead(LS_KEYS.actress).length + safeRead(LS_KEYS.article).length
}
