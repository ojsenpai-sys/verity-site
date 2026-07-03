/**
 * X 投稿生成の共有型。サーバー（admin-social-posts action）とクライアント
 * （SocialPostsClient）の双方が参照する。
 */

export type PostLang = 'ja' | 'en' | 'zh'
export type PostLangOrAll = PostLang | 'all'

export type PostType = 'ranking' | 'new_releases' | 'sale' | 'actress_trending'

/** ランキング項目（作品 or 女優）。name を主ラベルにして過激表現を避ける。 */
export type PostItem = {
  rank: number
  /** 主ラベル: 女優名（作品ランキングでも女優名を優先）。不明時はニュートラルな語。 */
  name: string
  /** 補助: 作品タイトル（日本語のまま・任意）。 */
  title?: string | null
  cid?: string | null
  /** 言語ニュートラルなメトリクス表記（例: '+120%' / 'NEW' / '★1,234'）。 */
  metric?: string | null
}

/** テンプレートキー = 見出し・ハッシュタグ・CTA の切り替え軸。 */
export type TemplateKey =
  | 'ranking_works'
  | 'actress_popular'
  | 'actress_rising'
  | 'new_todays_pick'
  | 'new_arrivals'
  | 'sale'

/** サーバーがデータ取得後に組み立てる正規化ペイロード。 */
export type PostData = {
  postType: PostType
  templateKey: TemplateKey
  items: PostItem[]
  /** 投稿本文に載せる VERITY サイト内 URL（アフィリエイト生リンクは載せない）。 */
  url: string
  /** 見出しに付ける期間ラベル（作品ランキングの体裁用・任意）。 */
  periodLabel?: 'today' | 'yesterday' | 'week' | 'overall' | null
  /** セール投稿用の付随情報。 */
  sale?: { name: string; discountLabel: string; count: number } | null
  /** 本日の注目新作（単品）の付随情報。 */
  singlePick?: { name: string | null; title: string | null; releaseDate: string | null } | null
}

export type PostVariant = {
  body: string
  weighted: number
  overLimit: boolean
}

export type ImageCandidate = {
  label: string
  /** 生画像 URL（コピー用） */
  url: string
  /** プロキシ経由の表示用 URL */
  proxyUrl: string
}

export type GenerateInput = {
  postType: PostType
  /** ランキング/新着/女優の表示件数（3 or 5） */
  count?: number
  /** actress_trending: 人気 or 急上昇 */
  variant?: 'popular' | 'rising'
  /** new_releases: 本日の注目新作(単品) or 新着まとめ(複数) */
  newMode?: 'todays_pick' | 'new_arrivals'
  /** sale: 対象キャンペーン */
  campaign?: 'chijo' | 'fanza_limited'
  /** ranking_works 見出しの期間ラベル（体裁用） */
  periodLabel?: 'today' | 'yesterday' | 'week' | 'overall'
  /** true で画像候補を返さない（露出抑制セーフモード） */
  safeMode?: boolean
}

export type GenerateResult =
  | {
      ok: true
      variants: Record<PostLangOrAll, PostVariant>
      images: ImageCandidate[]
      meta: { postType: PostType; templateKey: TemplateKey; itemCount: number; sourceNote: string; url: string }
    }
  | { ok: false; error: string }

// ── Phase 2: 履歴保存・成果記録 ──────────────────────────────────────────────

export type PostStatus = 'draft' | 'posted' | 'archived'

/** 生成結果から履歴保存するときの入力（1言語分）。 */
export type SavePostInput = {
  postType: PostType
  lang: PostLangOrAll
  body: string
  url: string
  imageCandidates: ImageCandidate[]
  sourceNote: string
}

export type SaveResult =
  | { ok: true; id: string; trackCode: string; trackedBody: string }
  | { ok: false; error: string }

/** posted_at 以降で user_events から集計した投稿単位の成果。 */
export type AttributedMetrics = {
  fanzaClick: number
  pageView: number
  signup: number
  engagement: number
  sessions: number
}

/** X 手入力指標（部分更新）。 */
export type ManualMetrics = {
  impressions?: number | null
  likes?: number | null
  reposts?: number | null
  replies?: number | null
  bookmarks?: number | null
}

/** 履歴一覧の1行（DB行＋成果）。 */
export type SocialPostRow = {
  id: string
  post_type: PostType
  lang: PostLangOrAll
  body: string
  url: string | null
  hashtags: string[]
  track_code: string
  status: PostStatus
  posted_at: string | null
  tweet_url: string | null
  impressions: number | null
  likes: number | null
  reposts: number | null
  replies: number | null
  bookmarks: number | null
  created_at: string
  /** posted_at 以降の成果（下書き=null） */
  attributed: AttributedMetrics | null
}
