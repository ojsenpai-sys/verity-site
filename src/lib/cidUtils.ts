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
 * NOW PRINTING 期間中の作品に対する暫定画像オーバーライド。
 *
 * DMM CDN は未公開作品のジャケット URL に対して 19KB 程度の "NOW PRINTING"
 * 画像を返すことがあり、プロキシの 8KB 閾値や now_printing リダイレクト判定では
 * 一部のサイズを取りこぼす。該当 CID をここでマッピングして暫定差し替えを行う。
 *
 * 正規ジャケットが公開された時点で該当エントリを削除する。
 */
const CID_IMAGE_OVERRIDES: Record<string, string> = {
  // 依本しおり 最新作 (働く女性に半中半外 ゴルフコーチ編) のジャケット未公開暫定
  babd00025: 'https://pics.dmm.co.jp/digital/video/mrss00188/mrss00188pl.jpg',
  babd025:   'https://pics.dmm.co.jp/digital/video/mrss00188/mrss00188pl.jpg',
}

/**
 * CID から CDN 画像 URL を生成する。
 * デジタル (digital/video) パスを常に第一候補とする。
 * 1namh, 1jera など数字始まりでもデジタル版として流通するケースが多いため
 * mono/digital の二択は行わず、プロキシの buildChain（双方向フォールバック）に委ねる。
 */
export function cidToCdnUrl(rawCid: string, size: 'jp' | 'pl' | 'ps' = 'pl'): string {
  const cid = normalizeCid(rawCid)
  const override = CID_IMAGE_OVERRIDES[cid] ?? CID_IMAGE_OVERRIDES[rawCid]
  if (override) return override
  return `https://pics.dmm.co.jp/digital/video/${cid}/${cid}${size}.jpg`
}

/**
 * DMM CDN URL のサフィックスに応じて `<img object-cover ...>` の
 * 適切な Tailwind object-position クラスを返す。
 *
 * プロキシの buildChain は pl/ps いずれの要求に対しても pl-format
 * (横長スプレッド・表紙右) を最優先で配信するため、要求 URL が pl/ps の
 * いずれでも実際に表示される画像はほぼ pl-format になる。jp.jpg を
 * 明示的に要求した場合のみ jp-format (縦長フロントのみ) が返る。
 *
 *  - pl.jpg / ps.jpg (DMM): プロキシは pl-format 配信 → object-right
 *  - jp.jpg (DMM): jp-format 配信 → object-center
 *  - 同人 (digital/comic): 正方寄せの表紙 → object-center
 *  - 非 DMM (Supabase Storage 等): 顔/ポートレート想定 → object-center
 *  - null / 空: object-center
 *
 * 新規 `<img>` を追加する際は必ずこのヘルパで object-position を決定すること。
 */
export function coverPosClass(url: string | null | undefined): string {
  if (!url) return 'object-center'
  if (url.includes('/digital/comic/')) return 'object-center'
  const isDmm = url.includes('pics.dmm.co.jp') || url.includes('pics.dmm.com')
  if (isDmm) return url.endsWith('jp.jpg') ? 'object-center' : 'object-right'
  return 'object-center'
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
