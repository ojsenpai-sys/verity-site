'use client'

import { useCallback, useEffect, useState } from 'react'

export type FavType = 'actress' | 'article'

export type FavMeta = { title: string; href: string }

const LS_KEYS: Record<FavType, string> = {
  actress: 'verity_fav_actresses',
  article: 'verity_fav_articles',
}

// Supplementary map: slug/id → { title, href } for display purposes
const META_KEYS: Record<FavType, string> = {
  actress: 'verity_fav_actresses_meta',
  article: 'verity_fav_articles_meta',
}

const FAV_CHANGED = 'verity:fav-changed'

function safeRead(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

function safeWrite(key: string, val: string[]) {
  localStorage.setItem(key, JSON.stringify(val))
  window.dispatchEvent(new Event(FAV_CHANGED))
}

function readMeta(type: FavType): Record<string, FavMeta> {
  try { return JSON.parse(localStorage.getItem(META_KEYS[type]) ?? '{}') } catch { return {} }
}

function writeMeta(type: FavType, id: string, meta: FavMeta | null) {
  const current = readMeta(type)
  if (meta) { current[id] = meta } else { delete current[id] }
  localStorage.setItem(META_KEYS[type], JSON.stringify(current))
}

export function useFavorite(type: FavType) {
  const key = LS_KEYS[type]

  // Start with [] on SSR/hydration — useEffect populates from localStorage after mount.
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

  const toggle = useCallback((id: string, meta?: FavMeta) => {
    const current = safeRead(key)
    const isAdding = !current.includes(id)
    const next = isAdding ? [...current, id] : current.filter(x => x !== id)
    safeWrite(key, next)
    setIds(next)

    // Persist / remove display metadata
    if (meta) writeMeta(type, id, isAdding ? meta : null)

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

export function readArticleMeta(): Record<string, FavMeta> {
  if (typeof window === 'undefined') return {}
  return readMeta('article')
}
