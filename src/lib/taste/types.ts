/**
 * Taste Check v1 の型定義。
 * 画像AI/embedding無し。既存 articles/actresses の metadata（actress/series/maker/tags）
 * だけを使う MVP 推薦体験のための型。
 */

export type TasteAnswer = 'like' | 'neutral' | 'dislike'

export type MetaEntry = { id: number; name: string }

/** Taste Check の出題/候補プールに使う軽量作品レコード（Article からの投影）。 */
export type TasteCandidate = {
  id: string
  externalId: string
  title: string
  slug: string
  imageUrl: string | null
  tags: string[]
  actress: MetaEntry[]
  series: MetaEntry[]
  maker: MetaEntry[]
  publishedAt: string | null
  /** getTopRankedWorks 等の既存人気シグナルから注入された場合 true。多様化・fallback判定に使う。 */
  isPopular?: boolean
}

export type TasteCandidatePool = {
  candidates: TasteCandidate[]
  /**
   * candidates に登場する女優の表示用レコード。
   * key は actresses.external_id（`dmm-actress-<numericId>` 形式。src/lib/actressUrl.ts の規約と一致）。
   */
  actressIndex: Record<string, TasteActressInfo>
}

export type TasteActressInfo = {
  externalId: string
  name: string
  imageUrl: string | null
}

export type AnsweredItem = {
  candidate: TasteCandidate
  answer: TasteAnswer
}

export type TasteWeights = {
  actress: Map<number, number>
  series: Map<number, number>
  maker: Map<number, number>
  tag: Map<string, number>
}

export type ScoredWork = {
  candidate: TasteCandidate
  score: number
  matchLabel: string
  reasons: string[]
}

export type ScoredActress = {
  info: TasteActressInfo
  score: number
  reason: string
}

export type TasteSummaryLine = string

export type TasteResult = {
  summary: TasteSummaryLine[]
  actresses: ScoredActress[]
  works: ScoredWork[]
}

export const TASTE_QUESTION_COUNT = 20
export const TASTE_MIN_REQUIRED_FOR_SIGNAL = 3
export const TASTE_MAX_ACTRESSES = 5
export const TASTE_MAX_WORKS = 10
