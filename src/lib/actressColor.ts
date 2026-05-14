/**
 * 女優名の文字列から一意の背景色を返すユーティリティ。
 * 白テキストとのコントラストが十分なカラーパレットから
 * ハッシュ値でインデックスを選択する。
 */

const PALETTE = [
  '#E20074', // magenta（ブランドカラー）
  '#7C3AED', // violet
  '#2563EB', // blue
  '#0891B2', // cyan
  '#059669', // emerald
  '#D97706', // amber
  '#DC2626', // red
  '#DB2777', // pink
  '#9333EA', // purple
  '#0284C7', // sky
  '#16A34A', // green
  '#EA580C', // orange
  '#4F46E5', // indigo
  '#0D9488', // teal
  '#C2410C', // orange-dark
  '#7E22CE', // purple-dark
] as const

function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function actressColor(name: string): string {
  return PALETTE[hashString(name) % PALETTE.length]
}
