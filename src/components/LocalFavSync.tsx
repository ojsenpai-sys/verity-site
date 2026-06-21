'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/components/AuthProvider'

// セッション単位でどのユーザーIDの同期が完了済みかを記録
const SESSION_KEY = 'verity_fav_synced_uid'

function readLS(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

// ログイン直後に一度だけ実行し、LocalStorageの女優お気に入りをSupabaseへマージする。
// 既存のDB側データは絶対に上書きしない（/api/favorites/sync がマージ処理を担保）。
export function LocalFavSync() {
  const { user, loading } = useAuth()
  const attempted = useRef(false)

  useEffect(() => {
    if (loading || !user || attempted.current) return

    // 同一セッション内で同じユーザーIDへの同期を二重実行しない
    const alreadySynced = sessionStorage.getItem(SESSION_KEY)
    if (alreadySynced === user.id) return

    attempted.current = true

    const actressIds = readLS('verity_fav_actresses')
    const articleIds = readLS('verity_fav_articles')
    if (actressIds.length === 0 && articleIds.length === 0) {
      sessionStorage.setItem(SESSION_KEY, user.id)
      return
    }

    const jobs: Promise<Response>[] = []
    if (actressIds.length > 0) {
      jobs.push(fetch('/verity/api/favorites/sync', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ actress_external_ids: actressIds }),
      }))
    }
    if (articleIds.length > 0) {
      jobs.push(fetch('/verity/api/favorites/sync-articles', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ article_ids: articleIds }),
      }))
    }

    Promise.all(jobs)
      .then(rs => { if (rs.every(r => r.ok)) sessionStorage.setItem(SESSION_KEY, user.id) })
      .catch(() => { attempted.current = false }) // 失敗時は次回マウント時に再試行
  }, [user, loading])

  return null
}
