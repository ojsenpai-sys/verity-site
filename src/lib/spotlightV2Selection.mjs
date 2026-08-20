// src/lib/spotlightV2Selection.mjs — Spotlight v2 共通の pure ロジック（DB/Next.js非依存）。
//
// isFuturePublished は Phase F-2/F-3 で実装済みの fastestReleasesSelection.mjs を
// そのまま再利用する（+9h 等のタイムゾーンハードコードをしない・同種ロジックを複製しない）。
//
// pure function のみ — 副作用なし。node:test で直接テスト可能。
import { isFuturePublished } from './fastestReleasesSelection.mjs'

/**
 * VR作品判定。ArticleCard.tsx の既存判定（tags のいずれかが "VR" で始まる）と
 * 同じ基準（新しい判定基準を作らない）。
 * @param {{ tags: string[] | null }} article
 * @returns {boolean}
 */
export function isVrWork(article) {
  return (article.tags ?? []).some((t) => /^VR/.test(t))
}

/**
 * 候補を優先順で並べた配列から、「現在すでに配信/発売済み」の最初の1件を返す。
 * 該当が1件もなければ null。
 * @template {{ published_at: string | null }} T
 * @param {T[]} candidatesInPriorityOrder
 * @param {string} nowIso
 * @returns {T | null}
 */
export function pickFirstReleased(candidatesInPriorityOrder, nowIso) {
  for (const c of candidatesInPriorityOrder) {
    if (c.published_at && !isFuturePublished(c.published_at, nowIso)) return c
  }
  return null
}

/**
 * published_at を基準に「予約中」か「配信中」かを判定し、バッジ/CTA文言を返す。
 * @param {string | null} publishedAt
 * @param {string} nowIso
 */
export function getReservationStatus(publishedAt, nowIso) {
  const future = publishedAt != null && isFuturePublished(publishedAt, nowIso)
  return future
    ? { isFuture: true, badge: '予約受付中', ctaLabel: 'FANZAで予約する' }
    : { isFuture: false, badge: 'NOW STREAMING', ctaLabel: '今すぐ観る' }
}
