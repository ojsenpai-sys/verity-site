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

// ── 巨乳キャンペーン30%OFF 全30作品（2026-07-08 CID差し替え） ──
// 恒久配線: 全件 cover:'pl'（横長パッケージ）→ coverPosClass→object-right で正面表紙をジャスト表示。
export const CHIJO_SALE_ITEMS: SaleItem[] = [
  { cid: 'hndb00278', cover: 'pl' },
  { cid: 'jur00648', cover: 'pl' },
  { cid: 'pppe00335', cover: 'pl' },
  { cid: 'mida00193', cover: 'pl' },
  { cid: 'sone00621', cover: 'pl' },
  { cid: 'mimk00204', cover: 'pl' },
  { cid: 'snos00104', cover: 'pl' },
  { cid: 'ipzz00582', cover: 'pl' },
  { cid: 'snos00093', cover: 'pl' },
  { cid: 'mida00165', cover: 'pl' },
  { cid: 'waaa00501', cover: 'pl' },
  { cid: 'mikr00036', cover: 'pl' },
  { cid: 'sone00466', cover: 'pl' },
  { cid: 'jufe00495', cover: 'pl' },
  { cid: 'midv00889', cover: 'pl' },
  { cid: 'sone00934', cover: 'pl' },
  { cid: 'ipzz00841', cover: 'pl' },
  { cid: 'mida00156', cover: 'pl' },
  { cid: 'cawd00799', cover: 'pl' },
  { cid: 'sone00279', cover: 'pl' },
  { cid: 'fway00043', cover: 'pl' },
  { cid: 'pppe00234', cover: 'pl' },
  { cid: 'sone00627', cover: 'pl' },
  { cid: 'jufe00583', cover: 'pl' },
  { cid: 'sone00754', cover: 'pl' },
  { cid: 'mfyd00009', cover: 'pl' },
  { cid: 'sone00131', cover: 'pl' },
  { cid: 'sone00568', cover: 'pl' },
  { cid: 'sone00504', cover: 'pl' },
  { cid: 'eyan00200', cover: 'pl' },
]

export const CHIJO_MORE_SALE_URL = 'https://video.dmm.co.jp/av/list/?campaign=kyonyucp&sort=suggest'

// ── 2026-07-08 更新: FANZA期間限定セール特集 指定25作品へ差し替え ──
// cover 省略（=pl 横長スプレッド配信）で coverPosClass→object-right。
export const FANZA_SALE_ITEMS: SaleItem[] = [
  { cid: 'ipzz00575' }, { cid: 'ipzz00613' }, { cid: 'ipzz00611' }, { cid: 'sone00786' }, { cid: 'ipzz00383' },
  { cid: 'ipzz00605' }, { cid: 'sone00804' }, { cid: 'sone00812' }, { cid: 'ipzz00610' }, { cid: 'sone00780' },
  { cid: 'ipzz00601' }, { cid: 'sone00798' }, { cid: 'sone00758' }, { cid: 'ipzz00604' }, { cid: 'dvaj00694' },
  { cid: 'sone00790' }, { cid: 'apgh00039' }, { cid: 'dass00657' }, { cid: 'sone00746' }, { cid: 'rki00719' },
  { cid: 'jur00380' }, { cid: 'davk00107' }, { cid: 'huntc00349' }, { cid: 'sone00802' }, { cid: 'mkmp00651' },
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
