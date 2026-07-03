/**
 * FANZA セールキャンペーンの作品データ（single source of truth）。
 *
 * 従来 FanzaChijoSaleBanner.tsx / Fanza100SaleBanner.tsx に個別ハードコードされていた
 * `SALE_ITEMS` / `MORE_SALE_URL` をここへ集約し、両バナーと X 投稿生成
 * （admin/social-posts）から共通参照する。
 *
 * ※表示ロジック（TEXTS 多言語コピー・画像/CTA レンダリング）はバナー側に残す。
 *   本モジュールは「どの CID がどのキャンペーンに属するか」だけを持つ。
 */

export type SaleItem = {
  cid: string
  actress?: string
  title?: string
  cover?: 'jp' | 'pl' // 画像実測で jp.jpg 有効時のみ 'jp'。省略時は pl(横長スプレッド)→object-right
}

export type SaleCampaign = {
  /** 内部キー（投稿タイプの選択肢に使用） */
  key: 'chijo' | 'fanza_limited'
  /** 投稿・バナー共通の日本語キャンペーン名 */
  name: string
  /** 割引バッジ文言（例: '30%OFF' / 'セール中'） */
  discountLabel: string
  /** FANZA セール会場 URL（アフィリエイトは呼び出し側で withAffiliate 付与） */
  moreSaleUrl: string
  items: SaleItem[]
}

// ── 巨乳キャンペーン30%OFF 全30作品（2026-07-03 CID差し替え） ──
// 恒久配線: 全件 cover:'pl'（横長パッケージ）→ coverPosClass→object-right で正面表紙をジャスト表示。
export const CHIJO_SALE_ITEMS: SaleItem[] = [
  { cid: 'ipzz00501', cover: 'pl' },
  { cid: 'mida00370', cover: 'pl' },
  { cid: 'ssis00606', cover: 'pl' },
  { cid: 'ipzz00771', cover: 'pl' },
  { cid: 'mida00478', cover: 'pl' },
  { cid: 'ofje00534', cover: 'pl' },
  { cid: 'sone00761', cover: 'pl' },
  { cid: 'dass00531', cover: 'pl' },
  { cid: 'ipzz00133', cover: 'pl' },
  { cid: 'midv00927', cover: 'pl' },
  { cid: 'yuj00057', cover: 'pl' },
  { cid: 'mida00550', cover: 'pl' },
  { cid: 'mida00158', cover: 'pl' },
  { cid: 'fpre00176', cover: 'pl' },
  { cid: 'midv00868', cover: 'pl' },
  { cid: 'blk00663', cover: 'pl' },
  { cid: 'mikr00009', cover: 'pl' },
  { cid: 'mida00119', cover: 'pl' },
  { cid: 'mida00520', cover: 'pl' },
  { cid: 'ofje00551', cover: 'pl' },
  { cid: 'royd00240', cover: 'pl' },
  { cid: 'ssis00088', cover: 'pl' },
  { cid: 'snos00038', cover: 'pl' },
  { cid: 'ofje00615', cover: 'pl' },
  { cid: 'snos00039', cover: 'pl' },
  { cid: 'ssis00116', cover: 'pl' },
  { cid: 'ofje00495', cover: 'pl' },
  { cid: 'waaa00492', cover: 'pl' },
  { cid: 'snos00146', cover: 'pl' },
  { cid: 'ssis00222', cover: 'pl' },
]

export const CHIJO_MORE_SALE_URL = 'https://video.dmm.co.jp/av/list/?campaign=kyonyucp'

// ── 2026-07-03 更新 v6: campaign=6565 編集長指定 最新25作品 ──
// 全25件 jp.jpg 不在（now_printing）→ cover 省略（=pl 横長スプレッド配信）で object-right。
export const FANZA_SALE_ITEMS: SaleItem[] = [
  { cid: 'mida00216' }, { cid: 'mida00210' }, { cid: 'mida00213' }, { cid: 'mida00212' }, { cid: 'mida00133' },
  { cid: 'mida00182' }, { cid: 'mida00226' }, { cid: 'mizd00464' }, { cid: 'mida00220' }, { cid: 'mida00215' },
  { cid: 'mikr00022' }, { cid: 'h_1711maan01085' }, { cid: 'sivr00420' }, { cid: 'waaa00537' }, { cid: 'waaa00541' },
  { cid: 'mimk00231' }, { cid: 'mida00217' }, { cid: 'xvsr00824' }, { cid: 'waaa00543' }, { cid: 'mida00225' },
  { cid: 'mida00214' }, { cid: 'kavr00429' }, { cid: 'cawd00845' }, { cid: 'kwbd00403' }, { cid: 'mimk00230' },
]

export const FANZA_MORE_SALE_URL = 'https://video.dmm.co.jp/av/list/?campaign=6565&sort=suggest'

// ── キャンペーン定義（投稿生成用） ──
export const SALE_CAMPAIGNS: Record<SaleCampaign['key'], SaleCampaign> = {
  chijo: {
    key: 'chijo',
    name: '巨乳キャンペーン 30%OFF特集',
    discountLabel: '30%OFF',
    moreSaleUrl: CHIJO_MORE_SALE_URL,
    items: CHIJO_SALE_ITEMS,
  },
  fanza_limited: {
    key: 'fanza_limited',
    name: 'FANZA 期間限定セール特集',
    discountLabel: 'セール中',
    moreSaleUrl: FANZA_MORE_SALE_URL,
    items: FANZA_SALE_ITEMS,
  },
}
