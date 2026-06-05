/**
 * お気に入り女優枠の最大数を計算するユーティリティ。
 *
 * 枠数内訳:
 *   - LP解放枠  : stars >= 6 → 9枠 / stars >= 3 → 6枠 / else → 3枠
 *   - サブスク特典: VERITY BLACK 有効時 +1枠
 *   - 購入枠    : purchased_slots（1枠 = 300円）
 *   - 上限       : 30枠（ハードキャップ）
 */
export function computeMaxFavorites(
  starsCount:            number,
  isSubscribed:          boolean,
  subscriptionExpiresAt: string | null,
  purchasedSlots:        number,
): number {
  const lpSlots   = starsCount >= 6 ? 9 : starsCount >= 3 ? 6 : 3
  const subActive = isSubscribed &&
    (!subscriptionExpiresAt || new Date(subscriptionExpiresAt) > new Date())
  return Math.min(lpSlots + (subActive ? 1 : 0) + purchasedSlots, 30)
}
