// ─────────────────────────────────────────────────────────────────────────────
// VERITY Spotlight — 特集定義
//
// 新特集を追加するには FEATURES に新エントリを追加するだけ。
// CMS不要、DBへの書き込み不要。
// ─────────────────────────────────────────────────────────────────────────────

export type WhyNotableItem = {
  emoji: string
  title: string
  body: string
}

export type TimelineItem = {
  date: string
  label: string
  note?: string
  isHighlight?: boolean
}

export type TweetEmbed = {
  url: string
  label?: string
}

export type SampleVideo = {
  /** DMM CID (例: ipzz00849) — embed URL は page 側で構築 */
  cid: string
  /** 表示タイトル（短縮版） */
  title: string
}

export type StatItem = {
  label: string
  value: string
  unit?: string
  auto?: boolean  // true = auto-computed in page (articles count / date)
}

export type FeatureConfig = {
  slug: string
  /** articles.tags[] に入っている女優名（SpotlightCard 画像取得用・後方互換） */
  actressTag: string
  /** 複数女優特集用 — タグ一覧（全員分） */
  actressTags?: string[]
  /** 表示用女優名（特集タイトル） */
  actressName: string
  /** ヒーロー画像を特定 CID から直接取得する場合に指定 */
  heroCid?: string
  /** 特集シリーズラベル */
  seriesLabel: string
  /** ヒーロー1行キャッチコピー */
  tagline: string
  /** ヒーロー説明文 */
  description: string
  /** 公開日 ISO 文字列 */
  publishedAt: string
  /**
   * 特集に使う CID を順序付きで指定。
   * 未指定時は actressTag で取得した上位記事を使用。
   */
  featuredCids?: string[]
  /** セクション1: なぜ注目 */
  whyNotable: WhyNotableItem[]
  /** セクション2: スタット上書き（自動集計 + 手動追加） */
  manualStats?: Omit<StatItem, 'auto'>[]
  /** セクション4: 編集部レビュー（Markdown） */
  review: string
  /** セクション4.5: サンプル動画（CID指定、動画配信版のみ対象） */
  sampleVideos?: SampleVideo[]
  /** セクション5: SNS反響 */
  tweets: TweetEmbed[]
  /** セクション6: タイムライン */
  timeline: TimelineItem[]
  /** SEO */
  seoDescription: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 特集定義
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURES: Record<string, FeatureConfig> = {
  'kin-sakura-kyu-mai': {
    slug: 'kin-sakura-kyu-mai',
    actressTag: '九野ひなの',
    actressTags: ['九野ひなの', '金松季歩', '桜空もも', '伊藤舞雪'],
    actressName: '金桜九舞',
    heroCid: 'mird00284',
    seriesLabel: 'VERITY Special',
    tagline: 'MOODYZ25周年記念。業界最高峰の専属4女優が奇跡の大共演を果たした歴史的大作。',
    description:
      'MOODYZ創立25周年記念。九野ひなの、金松季歩、桜空もも、伊藤舞雪という業界最高峰の専属トップ女優4人が奇跡の共演を果たした歴史的大作『金桜九舞』を総力特集。4人の圧倒的な気品と、それぞれのソロ最新作までを完全網羅したVERITY特別編集アーカイブ。',
    publishedAt: '2026-06-17',
    whyNotable: [
      {
        emoji: '✨',
        title: '九野ひなの',
        body: 'MOODYZが誇る最高峰の専属女優。圧倒的な美貌と演技力で業界を席巻し続ける。本作でも4人の中心的存在として他を寄せ付けない圧倒的な存在感を放つ。',
      },
      {
        emoji: '💛',
        title: '金松季歩',
        body: '知性と気品を兼ね備えたMOODYZ専属の実力派。上品なたたずまいの中に秘めた情熱が、本作品に唯一無二の深みを与える。ファン待望の共演作。',
      },
      {
        emoji: '🌸',
        title: '桜空もも',
        body: '名前の通り桜のような柔らかな美しさを持つMOODYZ専属トップ女優。高い人気とコアなファン層を誇り、本作でもその魅力を遺憾なく発揮する。',
      },
      {
        emoji: '❄️',
        title: '伊藤舞雪',
        body: '清楚で透明感あふれる美しさがファンを魅了するMOODYZ専属女優。作品ごとに新たな表情を見せ続ける進化する実力派として、本作でも印象的なシーンを担う。',
      },
    ],
    manualStats: [
      { label: 'MOODYZ創立', value: '25周年' },
      { label: '出演女優数', value: '4人' },
      { label: 'メーカー', value: 'MOODYZ' },
    ],
    sampleVideos: [
      { cid: 'mird00284', title: '金桜九舞 最高峰な妻たち。令和の専属ドリーム大共演 — 予告映像' },
    ],
    review: `## 編集部レビュー

25年という歳月をかけて積み上げてきたMOODYZのブランド価値。その集大成として発表された本作は、単なる豪華共演作品ではなく、一つの文化的事件と言っても過言ではない。

九野ひなの、金松季歩、桜空もも、伊藤舞雪。この4人の名前を並べることの意味を、業界を長く見てきた者なら誰もが理解するだろう。それぞれが独自の輝きを持ち、それぞれが単独でも頂点を張れる実力者たちだ。

その4人が同一の作品に集結したとき、そこに生まれるのは単純な足し算ではない。**化学反応と呼ぶべき、何か別の次元の美しさ**が立ち現れる。

MOODYZ25周年という節目の年に、この作品が生まれたことは必然だったのかもしれない。VERITYはこの歴史的共演を、特設アーカイブとして永く記録し続けていく。

---

*VERITY 編集部*`,
    tweets: [],
    timeline: [
      {
        date: '2026年6月',
        label: '発売・予約開始',
        note: 'MOODYZ25周年記念大作として全国同時リリース。予約段階から異例の注目を集める',
        isHighlight: true,
      },
      {
        date: '2026年6月17日',
        label: 'VERITY特設ページ公開',
        note: '4人の総力特集として本特設ページを緊急公開。関連ソロ作も完全網羅',
        isHighlight: true,
      },
      {
        date: 'Now',
        label: '随時更新予定',
        note: 'SNS反響・レビュー・関連作品情報をVERITYが引き続き追跡',
        isHighlight: false,
      },
    ],
    seoDescription:
      'MOODYZ創立25周年記念大作『金桜九舞』特設ページ。九野ひなの・金松季歩・桜空もも・伊藤舞雪4人の専属トップ女優が奇跡の共演を果たした歴史的大作を総力特集。',
  },
  'shinozaki-saho': {
    slug: 'shinozaki-saho',
    actressTag: '篠崎沙帆',
    actressName: '篠崎沙帆',
    seriesLabel: 'VERITY Spotlight',
    tagline: '次世代ブレイク最有力候補。今もっとも注目される新人女優を特集。',
    description:
      'デビューと同時にXで大きな反響を呼び、VERITYのアクセスランキングでも急上昇中。2026年最注目の新人女優・篠崎沙帆の魅力を深掘りする編集特集。',
    publishedAt: '2026-06-16',
    whyNotable: [
      {
        emoji: '🔥',
        title: 'Xで大きな反響',
        body: 'デビュー発表直後からXのAV関連トレンドを席巻。ファンの自発的な拡散が続いており、オーガニックリーチが急拡大中。',
      },
      {
        emoji: '⭐',
        title: 'VERITYランキング急上昇',
        body: 'VERITY内の女優ページビューで上位にランクイン。登録ユーザーのお気に入り追加数も急増している。',
      },
      {
        emoji: '🎬',
        title: '高いビジュアルクオリティ',
        body: '端正な顔立ちとスタイルの良さが際立つ。デビュー作から完成度の高い仕上がりで業界内の評価も高い。',
      },
      {
        emoji: '🌟',
        title: 'ファンコミュニティの熱量',
        body: 'ファン同士の情報共有が活発で、次回作への期待値が非常に高い。予約開始と同時に話題になるポテンシャルを持つ。',
      },
    ],
    manualStats: [
      { label: 'デビュー月', value: '2026年6月' },
      { label: 'Xフォロワー', value: '急増中' },
    ],
    sampleVideos: [
      { cid: 'ipzz00849', title: 'FIRST IMPRESSION 192 — AVデビュー作' },
      { cid: 'ipzz00870', title: 'ベロキス性交 上司もの — 第2作' },
    ],
    review: `## 編集部レビュー

篠崎沙帆という名前を初めて目にしたとき、その清潔感のある佇まいと圧倒的なビジュアルに目が止まった。

デビュー作を観ると、カメラへの自然な表情と初々しさの中に光る存在感が印象に残る。いわゆる「新人らしい」緊張感ではなく、むしろ場慣れした落ち着きのようなものがある。これは素の魅力だろう。

業界を長く追ってきた感覚で言えば、**一定の周期で「流れを変える新人」が現れる**。その水準に達していると感じる数少ない女優の一人だ。

今後の作品展開と彼女のペルソナがどう育っていくかを、VERITYは引き続き注目していく。

---

*VERITY 編集部*`,
    tweets: [
      {
        url: 'https://x.com/veritymedia0505/status/2064900297873649826',
        label: 'VERITY公式Xポスト',
      },
    ],
    timeline: [
      {
        date: '2026年6月9日',
        label: 'デビュー',
        note: 'ファースト作品を発売。X・各レビューサイトで即座に話題に',
        isHighlight: true,
      },
      {
        date: '2026年6月〜',
        label: 'Xで反響拡大',
        note: 'VERITY公式がポストした紹介ツイートが急拡散。ファンからの反響が続く',
        isHighlight: false,
      },
      {
        date: 'Now',
        label: '次回作に注目',
        note: 'VERITYでは引き続き動向を追跡・随時更新予定',
        isHighlight: false,
      },
    ],
    seoDescription:
      '今もっとも注目される新人女優・篠崎沙帆のVERITY特集。デビューから現在まで、編集部が深掘りして紹介するPower Push特集ページ。',
  },
}

export function getFeature(slug: string): FeatureConfig | null {
  return FEATURES[slug] ?? null
}

export function getAllFeatures(): FeatureConfig[] {
  return Object.values(FEATURES).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )
}
