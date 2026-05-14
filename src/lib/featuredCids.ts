/**
 * VERITYオススメ女優 — 管理者ピックアップの content_id リスト。
 * 順番が表示順に直結するため、変更時はここだけを編集する。
 * マーキー固定4名はここに含めない（MARQUEE_SYNC_CIDS を参照）。
 */
export const FEATURED_CIDS = [
  // ── S クラス看板 ─────────────────────────────────────────────
  'mida00649', // 石川澪
  'mida00653', // 小野六花
  'ipzz00795', // 佐々木さき
  // ── VERITYオススメ ───────────────────────────────────────────
  'snos183',   // 瀬戸環奈
  'snos208',   // 白石透羽
  'snos207',   // 渡部ほの
  'jufe622',   // 彩月七緒
  '1fns197',   // 女神ジュン
  'dass971',   // 千咲ちな
  'ipzz868',   // ひなの花音
  'snos220',   // 小日向みゆう
  'ipzz821',   // 山田鈴奈
  'hmn863',    // 五日市芽依
  'mikr00095', // 白岩冬萌
  'mida00584', // 福田ゆあ
  'jums168',   // 新妻ゆうか
] as const

/**
 * マーキー固定4名の代表CID。
 * FeaturedSection には表示しないが、同期・画像補完・latest_cid 復元の対象とする。
 */
export const MARQUEE_SYNC_CIDS = [
  'same00196',  // 宮西ひかる
  'mkmp00726',  // 逢沢みゆ
  '1jera00031', // 北岡果林
  '1namh00064', // 花守夏歩
] as const

/**
 * 同期後に必ず digital/video pl.jpg で強制上書きする CID（デジタル配信作品のみ）。
 */
export const FORCE_DIGITAL_CIDS = [
  'same00196',  // 宮西ひかる
  'mkmp00726',  // 逢沢みゆ
  '1jera00031', // 北岡果林
  '1namh00064', // 花守夏歩
  'ipzz00795',  // 佐々木さき
] as const

/**
 * マーキー固定4名の latest_cid マップ。
 * syncTopActresses が metadata を上書きして latest_cid を消すため、
 * syncAllSources の末尾で必ずこのマップを使って復元する。
 */
export const PINNED_ACTRESS_LATEST_CIDS: Record<string, string> = {
  '宮西ひかる': 'same00196',
  '逢沢みゆ': 'mkmp00726',
  '北岡果林': '1jera00031',
  '花守夏歩': '1namh00064',
  '佐々木さき': 'ipzz00795',
}