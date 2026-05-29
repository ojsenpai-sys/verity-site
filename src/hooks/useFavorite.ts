'use client'

import { useCallback, useSyncExternalStore } from 'react'

export type FavType = 'actress' | 'article'

const LS_KEYS: Record<FavType, string> = {
  actress: 'verity_fav_actresses',
  article: 'verity_fav_articles',
}

// Custom event fired on every add/remove so all useFavorite instances re-render
const FAV_CHANGED = 'verity:fav-changed'

function safeRead(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

function safeWrite(key: string, val: string[]) {
  localStorage.setItem(key, JSON.stringify(val))
  window.dispatchEvent(new Event(FAV_CHANGED))
}

function subscribeLS(cb: () => void) {
  window.addEventListener(FAV_CHANGED, cb)
  window.addEventListener('storage', cb) // cross-tab sync
  return () => {
    window.removeEventListener(FAV_CHANGED, cb)
    window.removeEventListener('storage', cb)
  }
}

export function useFavorite(type: FavType) {
  const key = LS_KEYS[type]

  const ids = useSyncExternalStore(
    subscribeLS,
    () => safeRead(key),
    () => [],
  )

  const toggle = useCallback((id: string) => {
    const current = safeRead(key)
    const isAdding = !current.includes(id)
    const next = isAdding ? [...current, id] : current.filter(x => x !== id)
    safeWrite(key, next)
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
