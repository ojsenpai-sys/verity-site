'use client'

import { useEffect } from 'react'
import { addRecentWork } from '@/lib/recentWorks'

type Props = {
  cid:      string
  slug:     string
  title:    string
  img:      string | null
  actress?: string
  /** FANZA アフィリエイト変換前の生 URL（描画側で withAffiliate 適用）。 */
  fz?:      string | null
}

/**
 * 作品ページ表示時に「最近見た作品」履歴へ記録する非表示コンポーネント。
 * LogView（video_view 計測）と同じ「作品閲覧成立」タイミングで発火する。
 * localStorage への書き込みのみで、Analytics イベントは一切送らない
 * （＝ Human v2/v3 の判定ロジックに影響しない）。
 */
export function RecentlyViewedRecorder({ cid, slug, title, img, actress, fz }: Props) {
  useEffect(() => {
    if (!cid || !slug) return
    addRecentWork({
      cid,
      slug,
      title,
      img,
      ...(actress ? { actress } : {}),
      ...(fz ? { fz } : {}),
      ts: Date.now(),
    })
    // マウント時のみ記録する（依存配列は空で固定）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
