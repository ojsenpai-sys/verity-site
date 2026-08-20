// ─────────────────────────────────────────────────────────────────────────────
// VERITY Spotlight — 逢沢みゆ特集 データ定義（Spotlight v2 第1弾）
//
// 作品は CID（articles.external_id）で参照し、タイトル・メーカー・発売日・画像は
// すべて DB から取得する（ここでは持たない）。ここが持つのは「VERITY編集部の視点」
// ＝カテゴリ構成・作品選定・選定理由・Editor's Pick・VERITY PICKSの軸だけ。
//
// Phase A/A-2 のユーザー承認済み選定をそのまま反映（自動スコア選定・勝手な入れ替えはしない）。
// ─────────────────────────────────────────────────────────────────────────────

export type CategoryKey = 'origin' | 'pure' | 'body' | 'passion' | 'fantasy'

export type CategoryDef = {
  key: CategoryKey
  label: string
  /** カード上のバッジ短縮表記 */
  badge: string
  /** カテゴリ冒頭の編集コメント（2〜4文） */
  comment: string
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'origin',
    label: 'ORIGIN',
    badge: 'ORIGIN',
    comment: 'アイドルからAV女優へ。S1専属デビュー期の初々しさと、変化の始まりを見る。',
  },
  {
    key: 'pure',
    label: 'PURE',
    badge: 'PURE',
    comment: '照れ、笑顔、距離の近さ。企画単体化後に広がった、可愛さを楽しむ逢沢みゆ。',
  },
  {
    key: 'body',
    label: 'BODY',
    badge: 'BODY',
    comment: '目を引くスタイルと身体表現。タイトルそのものがボディを主題に据えた作品を選んだ。',
  },
  {
    key: 'passion',
    label: 'PASSION',
    badge: 'PASSION',
    comment: '企画単体化してから広がった、表現の振れ幅と濃さ。今の逢沢みゆらしさが最も出るカテゴリ。',
  },
  {
    key: 'fantasy',
    label: 'FANTASY',
    badge: 'FANTASY',
    comment: '設定や世界観に飛び込み、コスプレやシチュエーションで別の逢沢みゆを楽しむ。',
  },
]

export type CategoryWork = {
  cid: string
  category: CategoryKey
  /** VERITY編集部の選定理由（80〜160字目安・作品説明の転載ではない） */
  reason: string
}

/** カテゴリ別 固定掲載作品（Phase A-2でユーザー承認済み。表示順=この配列順）。 */
export const CATEGORY_WORKS: CategoryWork[] = [
  // ── ORIGIN（3本） ──
  {
    cid: 'sone00004',
    category: 'origin',
    reason:
      'S1専属としてのデビュー作。「本物アイドルのAV転身」というキャッチコピー通り、緊張と初々しさがそのまま画面に残っています。review315件は本特集の候補の中でも際立って多く、彼女の原点として多くの人に観られてきた1本です。',
  },
  {
    cid: 'sone00149',
    category: 'origin',
    reason:
      'S1専属期、デビューからおよそ3ヶ月後の作品。「清楚系本物アイドルがエロス覚醒」というタイトル通り、初期の彼女がどう変化していったかが分かる1本です。',
  },
  {
    cid: 'sivr00322',
    category: 'origin',
    reason:
      '「元アイドル、そして今はAV女優！」というタイトルが、当時の彼女の立ち位置をそのまま言葉にしています。VR視点で距離の近さを味わえる、専属期らしい1本です。',
  },
  // ── PURE（3本） ──
  {
    cid: 'sqte00698',
    category: 'pure',
    reason:
      '「休日に彼女と。」というシリーズ名の通り、恋人のような距離感が前面に出た1本。温泉旅行という設定も相まって、企画単体化後の彼女が見せる親密な表情を楽しめます。',
  },
  {
    cid: 'sqte704',
    category: 'pure',
    reason:
      '「酔った勢いで友達と。」というタイトル通り、飾らないカジュアルな雰囲気が持ち味の1本。S-Cuteシリーズらしい素の距離感を味わえます。',
  },
  {
    cid: 'sone00005',
    category: 'pure',
    reason:
      'デビュー間もない時期の「初体験」がテーマの1本。アイドルからAV女優への転身直後らしい初々しさが、他の時期の作品とは違う魅力になっています。',
  },
  // ── BODY（4本） ──
  {
    cid: '5642hodv22029',
    category: 'body',
    reason:
      'タイトルがそのまま「尻アングル特化型AV」と語る通り、スタイルそのものを主題に据えた1本。身体的魅力をストレートに打ち出しています。',
  },
  {
    cid: 'royd317',
    category: 'body',
    reason:
      '「むっちむち巨乳ナイスボディ」とタイトルが明言する通り、ボディラインそのものを見せる1本。review8件が全て満点評価という点も特徴です。',
  },
  {
    cid: 'yrnknkjdvaj00715a',
    category: 'body',
    reason:
      '女子アスリートという設定に「巨乳」「スレンダー」「尻フェチ」タグが重なる1本。スポーツ系の企画でスタイルの良さが際立ちます。',
  },
  {
    cid: 'dvaj00715',
    category: 'body',
    reason:
      '陸上部員という設定の合宿もの。review8件で4.88という高評価も付いており、身体的な魅力を軸にした企画として選びました。',
  },
  // ── PASSION（4本） ──
  {
    cid: 'cemd00841',
    category: 'passion',
    reason:
      'タイトル通り「ノンストップ」で押し切る濃厚な1本。review6件が全て満点というのも特徴で、企画単体化後の彼女が見せる振れ幅の広さを象徴する作品です。',
  },
  {
    cid: 'cead00750',
    category: 'passion',
    reason:
      '「ド淫乱3SEX」という表現通り、濃密さを前面に出した1本。同メーカーのシリーズの中でも濃厚さが際立ちます。',
  },
  {
    cid: 'waaa00678',
    category: 'passion',
    reason:
      '「イクイク聖水痴女」というタイトルが示す通り、ハード系のタグが並ぶ1本。ワンズファクトリーらしい濃い企画性が特徴です。',
  },
  {
    cid: '1svfla00012',
    category: 'passion',
    reason:
      'review14件で4.79という、本特集の候補の中でも特に高評価な1本。4時間以上作品という長尺も含め、濃厚さを求める人向けの選定です。',
  },
  // ── FANTASY（3本） ──
  {
    cid: '1cpz6900011',
    category: 'fantasy',
    reason:
      '候補の中で唯一「ファンタジー」タグが公式に付与された1本。「もしも逢沢みゆがエルフだったら」という世界観そのものが、彼女の名前を使った独自企画になっています。',
  },
  {
    cid: 'fcvr00064',
    category: 'fantasy',
    reason:
      '江戸時代の遊郭という設定に飛び込んだVR作品。和服・浴衣というタグの通り、世界観への没入を重視した企画です。',
  },
  {
    cid: 'ymds00252',
    category: 'fantasy',
    reason:
      '「シロウト観察 モニタリング」という企画シリーズの1本。ファンミーティングという設定を通じて、通常のインタビューとは違う一面を見せています。',
  },
]

/** カテゴリ別 Editor's Pick（1本ずつ・大型カードで表示）と選定コメント。 */
export const EDITORS_PICK: Record<CategoryKey, { cid: string; comment: string }> & {
  now: { cid: string; comment: string }
} = {
  now: {
    cid: 'miab00677',
    comment:
      'MOODYZ「ドリームウーマン」シリーズという大型企画への出演。専属を離れ企画単体女優として歩んできた彼女が、いま大手メーカーの看板シリーズに名を連ねる——その到達点を象徴する1本として、本特集の起点に選びました。',
  },
  origin: {
    cid: 'sone00004',
    comment:
      '全てはここから始まりました。「本物アイドルのAV転身」というキャッチコピーの通り、逢沢みゆというキャリアの出発点。review315件という数字が、この1本がどれだけ多くの人に観られてきたかを物語っています。',
  },
  pure: {
    cid: 'sqte00698',
    comment:
      'S-Cuteシリーズらしい距離の近さと、「休日に彼女と。」というシリーズ名が示す親密感。review11件全てが満点評価という点も含め、PUREというテーマを最も自然体で体現している1本として選びました。',
  },
  body: {
    cid: '5642hodv22029',
    comment:
      'タイトルがそのまま「特化型AV」と語るほど、スタイルへの訴求がストレートな1本。BODYというカテゴリの入口として、迷いのない選定です。',
  },
  passion: {
    cid: 'cemd00841',
    comment:
      'review6件が全て満点という評価に加え、「ノンストップ」というタイトル通りの濃厚さ。凌辱色を避けつつ「濃い」を体現できる作品として、Spotlight全体のトーンを崩さない選定にしました。',
  },
  fantasy: {
    cid: '1cpz6900011',
    comment:
      '「もしも逢沢みゆがエルフだったら」という、彼女自身の名前を使った独自の世界観。候補の中で唯一公式に「ファンタジー」タグを持つ、最も自信を持って薦められる1本です。',
  },
}

/** VERITY PICKS（迷ったらこの作品）の軸。⑥⑦はNOW側で解決したCIDをページ側で差し込む。 */
export type VerityPickAxis =
  | { key: 'first'; label: 'はじめてなら'; cid: string }
  | { key: 'cute'; label: '可愛さなら'; cid: string; vrBadge?: boolean }
  | { key: 'style'; label: 'スタイルなら'; cid: string }
  | { key: 'intense'; label: '濃厚なら'; cid: string }
  | { key: 'situation'; label: 'シチュエーションなら'; cid: string }
  | { key: 'watch_now'; label: '今すぐ観るなら'; cid: 'AVAILABLE_NOW' }
  | { key: 'reserve'; label: '最新予約作なら'; cid: 'NOW_CID' }

export const VERITY_PICKS: VerityPickAxis[] = [
  { key: 'first', label: 'はじめてなら', cid: 'sone00004' },
  { key: 'cute', label: '可愛さなら', cid: 'sivr00322', vrBadge: true },
  { key: 'style', label: 'スタイルなら', cid: 'royd317' },
  { key: 'intense', label: '濃厚なら', cid: '1svfla00012' },
  { key: 'situation', label: 'シチュエーションなら', cid: 'ymds00252' },
  { key: 'watch_now', label: '今すぐ観るなら', cid: 'AVAILABLE_NOW' },
  { key: 'reserve', label: '最新予約作なら', cid: 'NOW_CID' },
]

/** NOW セクション: COMING NEXT（予約作）と AVAILABLE NOW（配信中フォールバック優先順）。 */
export const NOW_CONFIG = {
  comingNextCid: 'miab00677',
  /** 優先順。先頭から見て published_at <= now の最初の1本を採用する（page側で判定）。 */
  availableNowCandidates: ['cjod00528', 'pred00887'],
}

/** Spotlight 一覧・ヒーロー・SEO 用のメタ情報 */
export const AIZAWA_MIYU_META = {
  // 姓-名ローマ字表記（既存 satsuki-nao / shinozaki-saho と同じ規約）
  slug: 'aizawa-miyu',
  href: '/verity/spotlight/aizawa-miyu',
  publicUrl: '/spotlight/aizawa-miyu',
  seriesLabel: 'VERITY Spotlight',
  title: '逢沢みゆ — IN HER PRIME',
  actressName: '逢沢みゆ',
  actressRuby: 'あいざわみゆ',
  /** actresses.external_id — 女優ページ導線に使用 */
  actressExternalId: 'dmm-actress-1088602',
  /** articles.tags[] に入っている女優名 */
  actressTag: '逢沢みゆ',
  h1: 'MIYU AIZAWA — IN HER PRIME',
  subCopy: 'いま、逢沢みゆが面白い。',
  cardTagline: '元アイドルから企画単体女優へ。いま最も勢いのある逢沢みゆを、テーマ別に厳選。',
  seoTitle: '逢沢みゆ特集｜いま観るべきおすすめ作品をVERITYが厳選',
  seoDescription:
    '逢沢みゆのデビュー期から最新作まで、VERITYがテーマ別に厳選。可愛さ、スタイル、濃厚作、シチュエーション作品など、今観たい逢沢みゆ作品をまとめて紹介。',
  publishedAt: '2026-08-20',
} as const
