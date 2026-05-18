import { withAffiliate } from './affiliate'
import type { Article } from './types'

export function buildFanzaUrl(actressName: string, actressId: number | null): string {
  const page = actressId
    ? `https://www.dmm.co.jp/digital/videoa/-/list/=/article=actress/id=${actressId}/`
    : `https://www.dmm.co.jp/digital/videoa/-/list/search/=/?searchstr=${encodeURIComponent(actressName)}`
  return withAffiliate(page) ?? page
}

/**
 * 同一品番（metadata.number）の作品を重複排除し、動画配信版（floor=videoa）を優先して返す。
 * 品番なし・どちらか一方のみ存在する場合はそのまま通す。
 * 元の表示順を維持し、digital が後から現れた場合は先の DVD 行を削除して digital を残す。
 */
export function deduplicateDigitalFirst(articles: Article[]): Article[] {
  type Entry = { index: number; isDigital: boolean }
  const seen = new Map<string, Entry>()
  const result: (Article | null)[] = articles.slice()

  for (let i = 0; i < articles.length; i++) {
    const meta = articles[i].metadata
    const num = typeof meta?.number === 'string' ? meta.number : null
    if (!num) continue

    const isDigital = (typeof meta?.floor === 'string' ? meta.floor : null) === 'videoa'
    const existing = seen.get(num)

    if (!existing) {
      seen.set(num, { index: i, isDigital })
    } else if (!existing.isDigital && isDigital) {
      // 既存が DVD で今が digital → digital を残し DVD を削除
      result[existing.index] = null
      seen.set(num, { index: i, isDigital: true })
    } else {
      // 既存が digital（または両方 DVD の重複）→ 後者を削除
      result[i] = null
    }
  }

  return result.filter((a): a is Article => a !== null)
}
