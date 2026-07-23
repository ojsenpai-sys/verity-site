/**
 * 女優ページの正規 URL 生成ヘルパー。
 *
 * 正規形は `/verity/actresses/<external_id>`（女優ページの canonical と同一）。
 * external_id は `dmm-actress-<numericId>` 形式。コードベース各所でインライン重複していた
 * リンク生成をここへ集約する（新規リンク実装はこのヘルパを経由すること）。
 */

/** external_id 文字列（例: 'dmm-actress-1044864'）から女優ページ URL を返す。 */
export function actressPageHref(externalId: string): string {
  return `/verity/actresses/${externalId}`
}

/** DMM 数値 actress id から external_id を組み立てる。 */
export function actressExternalIdFromNumericId(id: number): string {
  return `dmm-actress-${id}`
}

/**
 * 作品 metadata.actress エントリ（{ id, name }）から遷移先 href を返す。
 *   - id > 0（VERITY 女優ページあり）→ 正規女優ページ
 *   - id <= 0（女優ページ無し）→ タグ検索フォールバック（既存挙動を踏襲）
 */
export function actressHrefFromMeta(entry: { id: number; name: string }): string {
  return entry.id > 0
    ? actressPageHref(actressExternalIdFromNumericId(entry.id))
    : `/?tag=${encodeURIComponent(entry.name)}`
}
