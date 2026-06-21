'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { trackEvent } from '@/lib/analytics'

// パスから pageType / pageId を分類（/verity 配下のみ。管理画面は計測しない）
function classify(path: string): { pageType: string; pageId?: string } | null {
  if (!path || !path.startsWith('/verity')) return null
  const p = path.replace(/\/+$/, '')
  if (p === '/verity') return { pageType: 'home' }
  if (p.startsWith('/verity/admin')) return null
  const seg = p.split('/').filter(Boolean) // ['verity', a, b, ...]
  const a = seg[1], b = seg[2]
  if (a === 'articles')  return { pageType: 'work', pageId: b }
  if (a === 'actresses' && seg[3] === 'genres') return { pageType: 'actress_genre', pageId: b }
  if (a === 'actresses' && b) return { pageType: 'actress', pageId: b }
  if (a === 'actresses') return { pageType: 'actresses_list' }
  if (a === 'genres')    return { pageType: 'genre', pageId: b }
  if (a === 'ranking')   return { pageType: 'ranking' }
  if (a === 'rankings')  return { pageType: 'rankings' }
  if (a === 'search')    return { pageType: 'search' }
  if (a === 'features')  return { pageType: 'feature', pageId: b }
  if (a === 'special')   return { pageType: 'special', pageId: b }
  if (a === 'news')      return { pageType: 'news', pageId: b }
  if (a === 'profile')   return { pageType: 'profile' }
  return { pageType: 'other' }
}

// verity レイアウトに1つだけマウント。SPA遷移=usePathname変化で1回発火。session_id は trackEvent が付与。
export function PageViewTracker() {
  const path = usePathname()
  const last = useRef<string>('')
  useEffect(() => {
    if (!path || last.current === path) return
    last.current = path
    const c = classify(path)
    if (c) trackEvent('page_view', { pageType: c.pageType, ...(c.pageId ? { pageId: c.pageId } : {}), path })
  }, [path])
  return null
}
