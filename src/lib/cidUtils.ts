/**
 * DMM CID の正規化と CDN URL 生成のユーティリティ。
 * pipeline.ts・ArticleCard・ActressMarqueeStrip の3箇所が参照する。
 */

/**
 * CID の末尾に付く小文字サフィックスを除去する。
 * 例: "mkmp726v" → "mkmp726", "hmn845r" → "hmn845"
 * 先頭がそのままであれば変化しない: "ipzz00795" → "ipzz00795"
 */
export function normalizeCid(cid: string): string {
  return cid.replace(/[a-z]+$/, '')
}

/**
 * CID から CDN 画像 URL を生成する。
 * デジタル (digital/video) パスを常に第一候補とする。
 * 1namh, 1jera など数字始まりでもデジタル版として流通するケースが多いため
 * mono/digital の二択は行わず、プロキシの buildChain（双方向フォールバック）に委ねる。
 */
export function cidToCdnUrl(rawCid: string, size: 'jp' | 'pl' | 'ps' = 'pl'): string {
  const cid = normalizeCid(rawCid)
  return `https://pics.dmm.co.jp/digital/video/${cid}/${cid}${size}.jpg`
}

/**
 * image_url が "壊れている" かどうかを判定する。
 * null / 空文字 / 'NOW PRINTING' の 3 ケースを検出する。
 */
export function isBadImageUrl(url: string | null | undefined): boolean {
  if (!url) return true
  const t = url.trim()
  return t === '' || t === 'NOW PRINTING'
}

/**
 * DMM CDN URL の画像サイズを高解像度パッケージ画像（pl.jpg）に変換する。
 *
 * ps.jpg（小・縦長）→ pl.jpg（大・横長 800×538）
 *
 * - ps.jpg 以外のサフィックス（pl.jpg / jp.jpg など）はそのまま返す。
 * - DMM 以外の URL（picsum 等）も変換せずそのまま返す。
 * - null / undefined は null を返す。
 *
 * 表示時はプロキシが jp.jpg → pl.jpg → ps.jpg の順でフォールバックするため、
 * DB には常に pl.jpg を正規 URL として保存することが望ましい。
 */
export function toHighResPackageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/ps\.jpg$/, 'pl.jpg')
}
