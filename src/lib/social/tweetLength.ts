/**
 * X（Twitter）の「加重文字数（weighted length）」を近似計算するヘルパー。
 *
 * X の仕様:
 *   - 通常文字は 1 カウント。
 *   - CJK（漢字・ひらがな・カタカナ・ハングル・全角記号）や絵文字は 2 カウント。
 *   - URL は実長に関わらず t.co 短縮で一律 23 カウント。
 *
 * 本モジュールは投稿前の目安表示専用（自動投稿はしない）。ZWJ 絵文字連結など
 * 一部ケースで公式値と ±数カウントずれる可能性があるため、上限判定には安全側の
 * マージン運用（280 手前で警告）を推奨する。
 */

export const TWEET_LIMIT = 280
export const URL_WEIGHT = 23

const URL_RE = /https?:\/\/[^\s]+/g

/** weight 2 とみなす Unicode コードポイント範囲（X の CJK 加重範囲＋絵文字近似）。 */
function isWeight2(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首・康煕部首・CJK 記号
    (cp >= 0x3041 && cp <= 0x33ff) || // ひらがな・カタカナ・CJK 互換
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 拡張A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 統合漢字
    (cp >= 0xa000 && cp <= 0xa4cf) || // ゆい文字
    (cp >= 0xac00 && cp <= 0xd7a3) || // ハングル音節
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 互換漢字
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 互換形
    (cp >= 0xff00 && cp <= 0xff60) || // 全角英数・記号
    (cp >= 0xffe0 && cp <= 0xffe6) || // 全角通貨等
    (cp >= 0x1f000 && cp <= 0x1faff) || // 絵文字（近似）
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK 拡張B以降
  )
}

/**
 * 投稿テキストの X 加重文字数を返す。
 * URL は 23 に固定し、残り文字を CJK=2 / その他=1 で加算する。
 */
export function tweetWeightedLength(text: string): number {
  if (!text) return 0
  const urlCount = (text.match(URL_RE) ?? []).length
  const withoutUrls = text.replace(URL_RE, '')

  let weight = 0
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0) ?? 0
    weight += isWeight2(cp) ? 2 : 1
  }
  return weight + urlCount * URL_WEIGHT
}

/** 280 加重を超えているか。 */
export function isOverTweetLimit(text: string): boolean {
  return tweetWeightedLength(text) > TWEET_LIMIT
}
