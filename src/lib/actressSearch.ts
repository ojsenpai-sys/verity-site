/**
 * 女優の tags 検索用 名前リスト（別名・表記揺れ対応）を生成する共通ヘルパー。
 *
 * 女優ページ / genres ページ / ranking-snapshot / SignatureWorks で
 * インライン実装されていた `[name, ...aliases]` パターンの正規化版。
 * Supabase の `.overlaps('tags', searchNames)` にそのまま渡せる文字列配列を返す。
 *
 * 仕様:
 *   - primaryName を必ず先頭に固定（表示名・Analytics 名との一貫性を維持）
 *   - metadata.aliases（配列以外は無視 → 不正データでも呼び出し側を壊さない）を連結
 *   - 追加候補（女優レコードの正規名など）を末尾に連結可能
 *   - trim・空文字除去・重複除去
 *   - MAX_SEARCH_NAMES 件で打ち切り（検索語の異常増加を防止）
 */

export const MAX_SEARCH_NAMES = 12

export function buildActressSearchNames(
  primaryName: string | null | undefined,
  metadata?: Record<string, unknown> | null,
  ...extra: (string | null | undefined)[]
): string[] {
  const rawAliases = metadata?.aliases
  const aliases = Array.isArray(rawAliases) ? rawAliases : []

  const seen = new Set<string>()
  const out: string[] = []

  for (const candidate of [primaryName, ...aliases, ...extra]) {
    if (typeof candidate !== 'string') continue
    const name = candidate.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= MAX_SEARCH_NAMES) break
  }

  return out
}
