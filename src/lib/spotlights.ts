// ─────────────────────────────────────────────────────────────────────────────
// VERITY Spotlight — 特集レジストリ（共通データ）
//
// トップページの Spotlight カード / 特集一覧 / ヘッダーメニューは、すべて
// このレジストリを読んで描画する。新しい Spotlight 特集を追加するときは
// SPOTLIGHTS に 1 エントリ足すだけでよい（DB書き込み・CMS不要）。
//
// ※ 個別特集の本文データ（作品リスト・編集コメント等）は特集ごとの lib に置く。
//    ここに置くのは「一覧に出すために必要な最小限のメタ情報」だけ。
// ─────────────────────────────────────────────────────────────────────────────

import { MENS_ESTHE_META } from './mensEsthe'
import { SATSUKI_NAO_META } from './satsukiNao'
import { AIZAWA_MIYU_META } from './aizawaMiyu'

export type SpotlightMeta = {
  slug: string
  /** 内部 <Link> 用の実ルート（/verity プレフィックス付き・ソフトナビ） */
  href: string
  /** 公開URL（ベアパス。proxy が /verity/ へリライトする）— canonical / sitemap 用 */
  publicUrl: string
  seriesLabel: string
  /** 一覧カードの見出し */
  title: string
  /** 一覧カードの1〜2行説明 */
  tagline: string
  /** カード上部の種別ラベル（例: Genre Feature / Actress Feature） */
  kindLabel: string
  publishedAt: string
  /**
   * 一覧カードのヒーロー画像の取得元。
   *   bySlug … articles.slug で引く / byCid … articles.external_id で引く
   */
  heroSource: { kind: 'bySlug'; value: string } | { kind: 'byCid'; value: string }
}

export const SPOTLIGHTS: SpotlightMeta[] = [
  {
    slug: AIZAWA_MIYU_META.slug,
    href: AIZAWA_MIYU_META.href,
    publicUrl: AIZAWA_MIYU_META.publicUrl,
    seriesLabel: AIZAWA_MIYU_META.seriesLabel,
    title: AIZAWA_MIYU_META.title,
    tagline: AIZAWA_MIYU_META.cardTagline,
    kindLabel: 'Actress Feature',
    publishedAt: AIZAWA_MIYU_META.publishedAt,
    heroSource: { kind: 'byCid', value: 'miab00677' },
  },
  {
    slug: SATSUKI_NAO_META.slug,
    href: SATSUKI_NAO_META.href,
    publicUrl: SATSUKI_NAO_META.publicUrl,
    seriesLabel: SATSUKI_NAO_META.seriesLabel,
    title: SATSUKI_NAO_META.title,
    tagline: SATSUKI_NAO_META.cardTagline,
    kindLabel: 'Actress Feature',
    publishedAt: SATSUKI_NAO_META.publishedAt,
    heroSource: { kind: 'byCid', value: SATSUKI_NAO_META.heroCid },
  },
  {
    slug: MENS_ESTHE_META.slug,
    href: MENS_ESTHE_META.href,
    publicUrl: MENS_ESTHE_META.publicUrl,
    seriesLabel: MENS_ESTHE_META.seriesLabel,
    title: MENS_ESTHE_META.title,
    tagline: '癒やし、距離感、空間演出。VERITYが厳選したメンズエステ作品を紹介。',
    kindLabel: 'Genre Feature',
    publishedAt: MENS_ESTHE_META.publishedAt,
    heroSource: { kind: 'bySlug', value: MENS_ESTHE_META.heroSlug },
  },
]

/** 公開日の新しい順（＝トップ／一覧での表示順） */
export function getAllSpotlights(): SpotlightMeta[] {
  return [...SPOTLIGHTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )
}
