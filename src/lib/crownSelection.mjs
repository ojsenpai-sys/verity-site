// src/lib/crownSelection.mjs — 王冠バッジ / VERITY マスター判定の pure ロジック。
//
// Phase: LP単独判定への統一。
//   旧: purchase/reservation click >= 10 AND LP >= 30
//   新: LP >= 30 のみ（クリック数は王冠判定に一切使用しない）。
//   click計測(sn_user_logs / get_user_actress_purchase_clicks)自体は他の称号
//   （first_action / wind_fire 等）で引き続き使うため変更しない。
//
// VERITY マスター: 「現在の推し全員」ではなく「現在の推しのうち王冠が3名以上」で解禁
//   （推しスロットが4名・5名等に拡張されていても crownCount >= 3 のみで判定する）。
//
// pure function のみ — 副作用なし・DB非依存。node:test で直接テスト可能。
// page.tsx(サーバー) / api/profile/route.ts / api/lp/route.ts / クライアント側の
// 即時反映のいずれからもこの1箇所を正本として呼び出す。

/** 王冠バッジ条件: 捧げた累計 LP（per actress）。sn_favorite_actresses.lp_points を使う。 */
export const CROWN_LP_THRESHOLD = 30

/** VERITY マスター条件: 現在の推しのうち王冠バッジ獲得者数の閾値。 */
export const VERITY_MASTER_CROWN_COUNT = 3

/** LPポイントのみで王冠バッジ獲得可否を判定する。 */
export function hasCrown(lpPoints) {
  return (lpPoints ?? 0) >= CROWN_LP_THRESHOLD
}

/**
 * 現在の推し女優ID配列と、女優ID→lp_pointsのマップから王冠獲得済み女優IDを返す。
 * @param {string[]} favoriteActressIds
 * @param {Record<string, number>} lpPointsMap
 * @returns {string[]}
 */
export function computeCrownActressIds(favoriteActressIds, lpPointsMap) {
  return favoriteActressIds.filter((id) => hasCrown(lpPointsMap[id]))
}

/** 王冠獲得数から VERITY マスター達成可否を判定する（現在の推し全員ではなく count 基準）。 */
export function isVerityMaster(crownCount) {
  return crownCount >= VERITY_MASTER_CROWN_COUNT
}

/** 王冠数から Stars（3/6/9 マイルストーン）を算出する。既存 sync_user_stars と同じ切り捨て。 */
export function computeStarsFromCrownCount(crownCount) {
  return crownCount >= 9 ? 9 : crownCount >= 6 ? 6 : crownCount >= VERITY_MASTER_CROWN_COUNT ? 3 : 0
}
