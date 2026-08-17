// src/lib/lovedoll/config.ts — LOVE DOLL特集 編集キュレーション設定。
//
// 重要: 掲載対象・掲載順は本ファイルが正本。APIやscoreによる自動選定・自動並び替えは行わない。
// 商品を追加/削除/並び替えする場合は、このファイルを直接編集すること。

/** 女優コラボ3体（最重要・SPECIAL COLLABORATION）。掲載順=配列順。 */
export const LOVEDOLL_COLLABORATION_CIDS = [
  'storeago01209ax0yw9pl5h',
  'storeago01209fuqkwxu825',
  'storeago01209hj0pyi4b9a',
] as const

/** VERITY PICK 2体。掲載順=配列順。 */
export const LOVEDOLL_VERITY_PICK_CIDS = [
  'do2114',
  'do2112',
] as const

/** MORE SELECTION 8体。掲載順=配列順。 */
export const LOVEDOLL_MORE_CIDS = [
  'do2108',
  'do2109',
  'do2110',
  'do2111',
  'do2113',
  'do2115',
  'do2116',
  'do2117',
] as const

export const LOVEDOLL_FEATURED = {
  collaboration: LOVEDOLL_COLLABORATION_CIDS,
  verityPick: LOVEDOLL_VERITY_PICK_CIDS,
  more: LOVEDOLL_MORE_CIDS,
} as const

/**
 * 編集コメント（WHY WE PICKED IT）。API事実とは分離した VERITY 編集部の主観コメント。
 * 商品に存在しない性能/specを推測して書かないこと。Phase Cでユーザー確認済みの本番公開文。
 * 書き換える場合はこの定数だけを編集すればよい構造にしている。
 */
export const LOVEDOLL_EDITORIAL_COMMENT: Record<string, string> = {
  'storeago01209ax0yw9pl5h':
    '実在の人気女優を等身大で表現するという、インパクト抜群のコラボモデル。50万円という価格も含め、現在のラブドールがどこまで進化しているのかを象徴する1体としてVERITYがピックアップ。',
  'storeago01209fuqkwxu825':
    '美園和花をモデルに、オリエント工業が手がけたコラボモデル。女優本人をモチーフにした造形だからこそ生まれる存在感に注目したい1体。',
  'storeago01209hj0pyi4b9a':
    '蓮実クレアをモデルにしたオリエント工業のコラボモデル。通常のラブドールとはまた違う、“実在する女優を再現する”というアプローチそのものに惹かれてVERITYがセレクト。',
  do2114:
    '女優コラボ以外でVERITYがまず注目したのが、このXTDOLL。157cmのフルシリコンボディという存在感と、リアルさを追求したビジュアルが目を引く1体。',
  do2112:
    'もう1体のVERITY PICKは蛍火日記のモデル。ラインナップの中でもひときわ目を引くボディデザインと存在感から、VERITYの5体に選出。',
}

/** 一覧CTA landing URL（Phase A実測: site=FANZA service=mono floor_code=goods directory=17730 total_count=246）。 */
export const LOVEDOLL_LANDING_URL =
  'https://www.dmm.co.jp/mono/goods/-/list/=/article=directory/id=17730/'
