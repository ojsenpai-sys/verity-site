// ─────────────────────────────────────────────────────────────────────────────
// VERITY Spotlight — メンズエステ特集 データ定義
//
// セクション⑤「VERITY特選！メンズエステ作品」で使用する記事 slug を
// 「通常作品」「VR作品」の 2 グループに分けて順序付きで保持する。
// 表示順は下記配列順を維持。重複は getMensEstheSlugs() で除外。
// DB書き込み不要・CMS不要。slug は articles.slug と一致する。
// ─────────────────────────────────────────────────────────────────────────────

/** 通常作品（表示順） */
export const MENS_ESTHE_NORMAL_SLUGS: string[] = [
  'icup-18--hmn00878',
  'chu--dass00994',
  '--ymdd00503',
  '--mikr00112',
  '--ipzz00862',
  'mens-24nld00032',
  '--2dfdm00075',
  'ng-stol00146',
  '-okzu00036',
  'ok--cjod00504',
  '03mm--hhkl00241',
  '--2dfdm00073',
  '--snos00201',
  'ok--cjod00507',
  '30sex-huntc00515',
  '7-h_237nacx00169',
  '--1koja00046',
  'ol-2cmno1--1fns00172',
  '--hhkl00232',
  '--pred00847',
  '20--waaa00623',
  '-grand-collection--umso00630',
  '--yrnkmtndvaj00716',
  '-291-sqte00658',
  '--snos00064',
  '-vol12-1dandya00018',
  'ok--waaa00610',
  '123-ok23special--pred00832',
  '--hmn00782',
  'g--dass0084',
  '--mdbk00397',
  '--waaa00596',
  '--2dfdm00065',
  '-10--miab00573',
  '--miab00572',
  '--mkmp00675',
  '-vol11-1dandy00996',
  '--sqsg00014',
  'ng--sone00820',
  'vol3-1dandy00985',
  '--sone00746',
  '-1sw01004',
  '--sone00752',
  'asmr--2emsk00025',
  '-1dandy00977',
  '22vol4-1dandy00971',
  '--mida00109',
  '-uzu00026',
  'asmr--2emsk00022',
  '3cm-vol3-1dandy00963',
  'asmr--2emsk00021',
  'ok--cjod00452',
  '-1sw00986',
  '-10-minamo-1start00208',
  '--sone00449',
  'lcup--sone00517',
  '--sone00299',
  '--sone00275',
  '--sone00279',
  '--sone00191',
  '--sone00143',
  '1cm--pfes00079',
  '-07--h_1711suke00123',
  '-ssis00857',
  '--ssis00595',
  '--ssis00591',
  'asmr--2emsk00007',
  '--mdbk00246',
  '--ssis00393',
  'no1100-8-best-ofje00357',
  '--ssis00347',
  '--agmx00096',
  '-mdbk00183',
]

/** VR作品（表示順） */
export const MENS_ESTHE_VR_SLUGS: string[] = [
  'vr131043-vrkm01839',
  'vr--mdvr00433',
  'vr--mdvr00426',
  'vrasmrvr-5--ajvr00317',
  'vr--ajvr00316',
  'vr8k-13dsvr01838',
  'vr85asmr--ajvr00288',
  'vr-ok--sivr00432',
  'vrl8k--sivr00418',
  'vr--sivr00361',
  'vr3--sivr00318',
  'vr--sivr00299',
  'vr-vr--sivr00237',
  'vr-vr-miru-sivr00158',
  'vr--sivr00150',
]

/**
 * 通常・VR を通した重複除去済み slug 一覧を返す。
 * グループ内・グループ間の重複はいずれも初出のみ残す。
 */
export function getMensEstheSlugs(): { normal: string[]; vr: string[]; all: string[] } {
  const seen = new Set<string>()
  const dedup = (arr: string[]) =>
    arr.filter((s) => {
      if (seen.has(s)) return false
      seen.add(s)
      return true
    })
  const normal = dedup(MENS_ESTHE_NORMAL_SLUGS)
  const vr = dedup(MENS_ESTHE_VR_SLUGS)
  return { normal, vr, all: [...normal, ...vr] }
}

/** Spotlight 一覧・ヒーロー・SEO 用のメタ情報 */
export const MENS_ESTHE_META = {
  slug: 'mens-esthe',
  // 公開URLはベアパス /spotlight/mens-esthe（proxy が /verity/ へリライト）。
  // 内部 <Link> はソフトナビ用に /verity プレフィックス付きの実ルートを指す
  // （兄弟の特集カードと同じ挙動）。
  href: '/verity/spotlight/mens-esthe',
  publicUrl: '/spotlight/mens-esthe',
  seriesLabel: 'VERITY Spotlight',
  title: 'メンズエステ作品特集',
  tagline: '癒やしという物語。大人の空間を描いた名作たち。',
  seoTitle: 'メンズエステ作品特集｜VERITY Spotlight',
  seoDescription:
    'メンズエステ作品の魅力や編集部おすすめ作品を紹介。癒やしをテーマにした人気作品をVERITY編集部が厳選。',
  publishedAt: '2026-07-16',
  /** 一覧カード・OG 画像に使うヒーロー作品の slug */
  heroSlug: 'icup-18--hmn00878',
} as const
