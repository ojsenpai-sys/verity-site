// src/components/favoriteButtonLogic.ts
// FavoriteButton のサーバー応答判定ロジック（Phase FAV-2）。
// JSX/Reactに依存しない純粋関数として切り出し、node --test で直接検証できるようにする
// （このプロジェクトに @testing-library/react 等のコンポーネントテスト基盤が無いため、
// DOM描画を要する部分はプロダクション検証に委ね、判定ロジックのみをここで厳密に担保する）。

export const MAX_REACHED_MESSAGE = 'お気に入り登録数が上限に達しています。マイページからお気に入りを整理してください。'
export const GENERIC_FAILURE_MESSAGE = 'お気に入りの更新に失敗しました。時間をおいてもう一度お試しください。'

export type FavoriteWriteOutcome = {
  shouldRevert: boolean
  message: string | null
}

/**
 * POST /verity/api/favorites/actress の応答を判定する。
 * このエンドポイントは「ソフト失敗」を HTTP 200 + { ok: false, reason: 'max_reached' } で返す
 * ため、res.ok だけでは判定できず、必ず JSON body の ok フィールドも見る必要がある。
 */
export function classifyActressFavoriteResponse(
  resOk: boolean,
  json: { ok?: boolean; reason?: string } | null,
): FavoriteWriteOutcome {
  if (resOk && json?.ok) return { shouldRevert: false, message: null }
  if (json?.reason === 'max_reached') return { shouldRevert: true, message: MAX_REACHED_MESSAGE }
  return { shouldRevert: true, message: GENERIC_FAILURE_MESSAGE }
}

/**
 * POST /verity/api/favorites/article の応答を判定する。
 * このエンドポイントは成功時 { ok: true, ... } / 失敗時は非2xx + { error } のみを返し、
 * ソフト失敗（200 + ok:false）は存在しないため res.ok のみで判定できる。
 */
export function classifyArticleFavoriteResponse(resOk: boolean): FavoriteWriteOutcome {
  if (resOk) return { shouldRevert: false, message: null }
  return { shouldRevert: true, message: GENERIC_FAILURE_MESSAGE }
}

/** ネットワーク例外・JSONパース失敗など、応答そのものを解釈できない場合。 */
export function classifyFavoriteRequestException(): FavoriteWriteOutcome {
  return { shouldRevert: true, message: GENERIC_FAILURE_MESSAGE }
}
