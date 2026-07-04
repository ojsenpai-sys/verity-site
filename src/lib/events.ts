// ─────────────────────────────────────────────────────────────────────────────
// VERITY イベントハブ — イベント定義
//
// リアルイベント（TRE 等）に合わせて出演女優のX投稿・関連作品をまとめる特設基盤。
// 新イベントを追加するには EVENTS に1エントリを追加するだけ。
// CMS不要・DBへの書き込み不要。将来 events / event_actresses テーブルに
// 移行しても同じ形（slug / name / start_date / end_date / keywords /
// actresses[x_handle, external_id]）を保てるよう設計している。
// ─────────────────────────────────────────────────────────────────────────────

import tweetData from '@/data/events/tre2026-tweets.json'

/** 概要セクションの関連リンク（公式サイト・チケット等） */
export type EventLink = {
  label: string
  url: string
}

/** 出演女優。external_id があれば内部女優ページへ内部リンクする。無ければ X 外部リンクのみ。 */
export type EventActress = {
  /** X スクリーンネーム（@なし。例: 'saika_kawakita'） */
  screenName: string
  /** 表示名 / articles.tags[] に入っている女優名（関連作品取得に使用） */
  name: string
  /** 'dmm-actress-XXXXXXX' 形式。存在すれば内部女優ページ /verity/actresses/<external_id> へ */
  externalId?: string
}

export type EventStatus = 'upcoming' | 'live' | 'ended'

export type EventConfig = {
  /** URL slug（例: 'tre2026'） */
  slug: string
  /** 正式名称 */
  name: string
  /** 短縮名（ハッシュタグ的な表示用。例: 'TRE2026'） */
  shortName?: string
  /** 開催地（例: '台湾・台北'） */
  location: string
  /** 会場（例: '台北南港展覧館2館'） */
  venue?: string
  /** 開催期間 ISO 'YYYY-MM-DD' */
  startDate: string
  endDate: string
  /** 概要説明 */
  description: string
  /** 概要セクションの関連リンク */
  links: EventLink[]
  /** 投稿の優先表示に使うキーワード（本文一致で eventRelated 扱い） */
  keywords: string[]
  /** 出演女優 */
  actresses: EventActress[]
  /** AI要約枠（初期は手書き。将来 generateEventSummary() に差し替え可能） */
  aiSummary?: string
  /** ステータスを固定したい場合に指定。未指定なら開催期間から自動算出。 */
  status?: EventStatus
}

/**
 * キュレーションされたX投稿（手動JSON）。
 * MVP では本文/画像は転載せず、公式X埋め込み（TweetEmbedBlock）で描画する。
 * body / postedAt は「並び替え・キーワード優先」の内部メタとしてのみ利用する。
 */
export type EventTweet = {
  /** 投稿者 X スクリーンネーム（@なし）。EventConfig.actresses と突合し女優導線を付ける。 */
  screenName: string
  /** 表示名（フォールバック用。actresses に無い場合に使用） */
  name?: string
  /** ツイート URL（https://x.com/<user>/status/<id>） */
  url: string
  /** 投稿日時 ISO。時系列ソートに使用。 */
  postedAt?: string
  /** イベント関連キーワードを含む投稿（優先表示） */
  eventRelated?: boolean
  /** 編集メモ（任意） */
  note?: string
  /** true = まだ実URL未確定のプレースホルダ。公開前に差し替える。 */
  placeholder?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// イベント定義
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTS: Record<string, EventConfig> = {
  tre2026: {
    slug: 'tre2026',
    name: 'TRE 台北國際成人展 2026',
    shortName: 'TRE2026',
    location: '台湾・台北',
    venue: '台北南港展覧館2館',
    startDate: '2026-07-03',
    endDate: '2026-07-05',
    description:
      '台湾・台北で開催される TRE（Taipei Red Expo）2026 に合わせ、出演する日本人女優の出演告知・TRE関連投稿・最近のX投稿と関連作品を VERITY がまとめる特設コーナー。各女優のプロフィール・最新作まで、そのままたどれる。会場からの最新投稿は随時反映予定。',
    links: [
      { label: 'TRE公式Instagram', url: 'https://www.instagram.com/TRETAIPEI/' },
    ],
    keywords: ['TRE', 'TRE2026', '台湾', '台北', 'Taiwan', 'Taipei', '南港'],
    // 出演女優: 公式ガイドの2026ラインナップ ∩ 登録X handle（socialFeedActresses.ts）で
    // 確定した攻撃陣。externalId は DB actresses から解決済み（読み取り専用・書き込みなし）。
    // 表示順は代言人・第二波の話題性を優先。screenName は @ なしの正式ハンドル。
    actresses: [
      { screenName: 'saika_kawakita', name: '河北彩花', externalId: 'dmm-actress-1044864' },
      { screenName: 'kanna_seto0510', name: '瀬戸環奈', externalId: 'dmm-actress-1099472' },
      { screenName: '_ishikawamio_', name: '石川澪', externalId: 'dmm-actress-1072127' },
      { screenName: 'sakumomo1203', name: '桜空もも', externalId: 'dmm-actress-1039157' },
      { screenName: 'mashiro__sana', name: '純白彩永', externalId: 'dmm-actress-1102740' },
      { screenName: 'watanabe_h0n0', name: '渡部ほの', externalId: 'dmm-actress-1105407' },
      { screenName: 'miruteer_29', name: 'miru', externalId: 'dmm-actress-1069632' },
      { screenName: 'mayukiito', name: '伊藤舞雪', externalId: 'dmm-actress-1042907' },
      { screenName: 'kiho_kanematsu', name: '金松季歩', externalId: 'dmm-actress-1092091' },
      { screenName: 'rei_kamiki', name: '神木麗', externalId: 'dmm-actress-1076785' },
      { screenName: 'remu_suzumori', name: '涼森れむ', externalId: 'social-remu_suzumori' },
      { screenName: 'akari_tsumugi__', name: '明里つむぎ', externalId: 'dmm-actress-1037663' },
      { screenName: 'mia_nanasawa', name: '七沢みあ', externalId: 'dmm-actress-1042129' },
      { screenName: 'riri_nntmr', name: '七ツ森りり', externalId: 'dmm-actress-1063214' },
      { screenName: 'onorikka', name: '小野六花', externalId: 'dmm-actress-1060677' },
      { screenName: 'yaginana0903', name: '八木奈々', externalId: 'dmm-actress-1057477' },
      { screenName: 'rena_miyashita', name: '宮下玲奈', externalId: 'dmm-actress-1075464' },
      { screenName: 'honjosuzu', name: '本庄鈴', externalId: 'dmm-actress-1044857' },
      { screenName: 'yua_fucuda', name: '福田ゆあ', externalId: 'dmm-actress-1106862' },
      { screenName: 'nao_satsuki', name: '彩月七緒', externalId: 'dmm-actress-1089946' },
      { screenName: '_tojo_natsu', name: '東條なつ', externalId: 'dmm-actress-1059080' },
      { screenName: '7mim_sub', name: '松本菜奈実', externalId: 'dmm-actress-1037168' },
      { screenName: 'Aizawa_miyu03', name: '逢沢みゆ', externalId: 'dmm-actress-1088602' },
      { screenName: '_yu_8_8', name: '田野憂', externalId: 'dmm-actress-1093791' },
      // 未登録（VERITY女優ページ無し）— X外部リンクにdegrade
      { screenName: 'alice_710_', name: '釈アリス' },
    ],
    aiSummary:
      '【TRE2026 出演女優まとめ（手動・暫定）】2026年7月3〜5日、台北南港展覧館2館で開催のTRE2026に河北彩花・桜空もも・石川澪・瀬戸環奈ら日本人女優が出演。本コーナーでは各女優の出演告知・TRE関連投稿・最近のX投稿と関連作品をまとめています。会場からの最新投稿は随時反映予定。※編集部による暫定要約です。将来はX投稿からの自動生成に対応予定。',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// アクセサ
// ─────────────────────────────────────────────────────────────────────────────

export function getEvent(slug: string): EventConfig | null {
  return EVENTS[slug] ?? null
}

export function getAllEvents(): EventConfig[] {
  return Object.values(EVENTS).sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  )
}

/** 手動JSONからイベントの投稿一覧を取得（eventRelated 優先 → postedAt 降順）。 */
export function getEventTweets(slug: string): EventTweet[] {
  // JSON は { _note: string, <slug>: EventTweet[] } 形。_note はメタなので無視。
  const all = tweetData as unknown as Record<string, EventTweet[] | string>
  const list = (all[slug] as EventTweet[] | undefined) ?? []
  return [...list].sort((a, b) => {
    // イベント関連投稿を先頭に
    if (!!a.eventRelated !== !!b.eventRelated) return a.eventRelated ? -1 : 1
    // 次に新しい順
    const ta = a.postedAt ? new Date(a.postedAt).getTime() : 0
    const tb = b.postedAt ? new Date(b.postedAt).getTime() : 0
    return tb - ta
  })
}

/** 開催期間と現在時刻からステータスを算出（config.status 指定があればそれを優先）。 */
export function resolveEventStatus(event: EventConfig, now: Date = new Date()): EventStatus {
  if (event.status) return event.status
  const start = new Date(`${event.startDate}T00:00:00+09:00`).getTime()
  const end = new Date(`${event.endDate}T23:59:59+09:00`).getTime()
  const t = now.getTime()
  if (t < start) return 'upcoming'
  if (t > end) return 'ended'
  return 'live'
}
