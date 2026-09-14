import type { TasteCandidate } from './types'

export type SelectDiagnosisSetOptions = {
  count?: number
  /** 直近の診断で既に出題済みの external_id（再診断時の重複回避用）。 */
  excludeExternalIds?: ReadonlySet<string>
  /** 同一女優の最大出題数。 */
  maxPerActress?: number
  /** 同一メーカーの最大出題数。 */
  maxPerMaker?: number
  /** テスト用に差し替え可能な乱数生成器（[0,1)）。省略時は Math.random。 */
  rng?: () => number
}

const DEFAULT_COUNT = 20
const DEFAULT_MAX_PER_ACTRESS = 2
const DEFAULT_MAX_PER_MAKER = 3

/** Fisher-Yates shuffle。rng は再現可能なテストのために差し替え可能。 */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function isValidCandidate(c: TasteCandidate): boolean {
  return Boolean(c.externalId) && Boolean(c.imageUrl) && c.actress.length > 0
}

/**
 * 出題可能な作品プールから、女優/メーカーに極端な偏りが出ないよう20件（既定）を選ぶ。
 * pure function — DB/乱数の外部状態は rng 引数経由でのみ受け取る。
 *
 * 制約を満たせない場合（プールが小さい等）は、可能な範囲まで緩和して埋める
 * graceful degradation。count 件に満たない配列を返すことがある（呼び出し側で対応）。
 */
export function selectDiagnosisSet(
  pool: readonly TasteCandidate[],
  options: SelectDiagnosisSetOptions = {},
): TasteCandidate[] {
  const count = options.count ?? DEFAULT_COUNT
  const maxPerActress = options.maxPerActress ?? DEFAULT_MAX_PER_ACTRESS
  const maxPerMaker = options.maxPerMaker ?? DEFAULT_MAX_PER_MAKER
  const excludeIds = options.excludeExternalIds ?? new Set<string>()
  const rng = options.rng ?? Math.random

  // dedup by externalId、無効候補を除外
  const seen = new Set<string>()
  const deduped: TasteCandidate[] = []
  for (const c of pool) {
    if (!isValidCandidate(c)) continue
    if (excludeIds.has(c.externalId)) continue
    if (seen.has(c.externalId)) continue
    seen.add(c.externalId)
    deduped.push(c)
  }

  const shuffled = shuffle(deduped, rng)

  // 1st pass: 多様性制約を守りながら選ぶ
  const actressCount = new Map<number, number>()
  const makerCount = new Map<number, number>()
  const selected: TasteCandidate[] = []
  const skipped: TasteCandidate[] = []

  const fits = (c: TasteCandidate): boolean => {
    for (const a of c.actress) {
      if ((actressCount.get(a.id) ?? 0) >= maxPerActress) return false
    }
    for (const m of c.maker) {
      if ((makerCount.get(m.id) ?? 0) >= maxPerMaker) return false
    }
    return true
  }

  const commit = (c: TasteCandidate) => {
    for (const a of c.actress) actressCount.set(a.id, (actressCount.get(a.id) ?? 0) + 1)
    for (const m of c.maker) makerCount.set(m.id, (makerCount.get(m.id) ?? 0) + 1)
    selected.push(c)
  }

  for (const c of shuffled) {
    if (selected.length >= count) break
    if (fits(c)) commit(c)
    else skipped.push(c)
  }

  // 2nd pass (緩和): プールが小さく制約下では埋まらない場合、残りを制約無視で追加
  if (selected.length < count) {
    for (const c of skipped) {
      if (selected.length >= count) break
      commit(c)
    }
  }

  return selected
}
