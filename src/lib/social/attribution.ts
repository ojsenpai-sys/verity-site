/**
 * X投稿の成果アトリビューション用ヘルパー（サーバー/クライアント両用・純関数）。
 *
 * 投稿URLに ?vp=<track_code> を付与し、着地セッションの user_events に vp を紐づける
 * ことで「どのX投稿がどれだけ送客/PV/登録を生んだか」を posted_at 以降の窓で集計する。
 */

/** sessionStorage / metadata に載せる vp のキー名。 */
export const VP_STORAGE_KEY = 'verity_vp'
export const VP_METADATA_KEY = 'vp'

/**
 * URL に ?vp=<code> を付与する。
 * - 既存クエリがあれば & で連結。
 * - ハッシュ(#...)がある場合は vp をハッシュより前に挿入する
 *   （例: /?vp=abc#fanza-chijo-sale）。
 */
export function buildTrackedUrl(url: string, code: string): string {
  if (!url || !code) return url
  const hashIdx = url.indexOf('#')
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : ''
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}${VP_METADATA_KEY}=${encodeURIComponent(code)}${hash}`
}

/**
 * 投稿本文中の素のURLを、?vp= 付きURLに差し替える。
 * body 末尾行に置かれた素URL（1回のみ出現）を対象にする。
 */
export function applyTrackCodeToBody(body: string, url: string, code: string): string {
  if (!body || !url || !code) return body
  const tracked = buildTrackedUrl(url, code)
  return body.split(url).join(tracked)
}

/** 10桁の URL セーフな track_code を生成（衝突は UNIQUE 制約で担保）。 */
export function generateTrackCode(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}
