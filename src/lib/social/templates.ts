/**
 * X 投稿の多言語コピー辞書（テンプレート駆動・LLM 不使用）。
 *
 * 方針（Phase 1・低リスク）:
 *   - 過激表現を避けるため、主ラベルは女優名・順位・数値を用いる。
 *   - 露骨な作品タイトルは既定で本文に載せない（本日の注目新作のみ日本語タイトルを短縮表示）。
 *   - ハッシュタグは節度あるセット。多言語（all）はマージ＋重複排除で最大 5 個に抑制。
 */

import type { PostLang, TemplateKey } from './types'

type LangMap = Record<PostLang, string>
type LangTags = Record<PostLang, string[]>

/** 期間ラベル（作品ランキング見出しの体裁用）。overall は空文字。 */
export const PERIOD_LABEL: Record<PostLang, Record<'today' | 'yesterday' | 'week' | 'overall', string>> = {
  ja: { today: '今日の', yesterday: '昨日の', week: '今週の', overall: '' },
  en: { today: "Today's ", yesterday: "Yesterday's ", week: "This Week's ", overall: '' },
  zh: { today: '今日', yesterday: '昨日', week: '本周', overall: '' },
}

export const HEADLINE: Record<TemplateKey, LangMap> = {
  ranking_works: {
    ja: '📊 VERITY {period}人気作品ランキング',
    en: '📊 VERITY {period}Popular Works',
    zh: '📊 VERITY {period}人气作品排行',
  },
  actress_popular: {
    ja: '👑 VERITY 人気女優ランキング',
    en: '👑 VERITY Most Popular Actresses',
    zh: '👑 VERITY 人气女优排行',
  },
  actress_rising: {
    ja: '📈 急上昇 女優ランキング',
    en: '📈 Trending Actresses Now',
    zh: '📈 急上升女优排行',
  },
  new_todays_pick: {
    ja: '✨ 本日の注目新作',
    en: "✨ Today's Featured Release",
    zh: '✨ 今日推荐新作',
  },
  new_arrivals: {
    ja: '🆕 新着作品まとめ',
    en: '🆕 New Releases',
    zh: '🆕 最新上架作品',
  },
  sale: {
    ja: '🔥 FANZAセール情報',
    en: '🔥 FANZA Sale',
    zh: '🔥 FANZA 优惠特辑',
  },
}

export const CTA: Record<TemplateKey, LangMap> = {
  ranking_works: { ja: '▶ ランキングを見る', en: '▶ See the ranking', zh: '▶ 查看排行' },
  actress_popular: { ja: '▶ ランキングを見る', en: '▶ See the ranking', zh: '▶ 查看排行' },
  actress_rising: { ja: '▶ 急上昇をチェック', en: '▶ See who’s trending', zh: '▶ 查看急上升' },
  new_todays_pick: { ja: '▶ 詳しくはこちら', en: '▶ Details here', zh: '▶ 查看详情' },
  new_arrivals: { ja: '▶ 新着をチェック', en: '▶ Browse new releases', zh: '▶ 查看新作' },
  sale: { ja: '▶ セール対象をチェック', en: '▶ Check the sale', zh: '▶ 查看优惠' },
}

const BASE_TAGS: LangTags = {
  ja: ['#FANZA', '#AV女優'],
  en: ['#JAV', '#FANZA'],
  zh: ['#FANZA', '#日本AV'],
}

const EXTRA_TAGS: Record<TemplateKey, LangTags> = {
  ranking_works: { ja: ['#ランキング'], en: ['#ranking'], zh: ['#排行榜'] },
  actress_popular: { ja: ['#セクシー女優'], en: ['#actress'], zh: ['#女优'] },
  actress_rising: { ja: ['#急上昇'], en: ['#trending'], zh: ['#女优'] },
  new_todays_pick: { ja: ['#新作'], en: ['#newrelease'], zh: ['#新作品'] },
  new_arrivals: { ja: ['#新作'], en: ['#newrelease'], zh: ['#新作品'] },
  sale: { ja: ['#セール', '#お得'], en: ['#sale', '#deal'], zh: ['#优惠', '#特价'] },
}

/** 指定言語・テンプレートのハッシュタグ配列。 */
export function hashtagsFor(key: TemplateKey, lang: PostLang): string[] {
  return [...BASE_TAGS[lang], ...EXTRA_TAGS[key][lang]]
}

/** all 用: 3 言語のハッシュタグをマージし重複排除、最大 5 個に抑制。 */
export function mergedHashtags(key: TemplateKey): string[] {
  const all = [
    ...hashtagsFor(key, 'ja'),
    ...hashtagsFor(key, 'en'),
    ...hashtagsFor(key, 'zh'),
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of all) {
    const norm = t.toLowerCase()
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(t)
    if (out.length >= 5) break
  }
  return out
}

/** セール本文の 1 行（言語別）。 */
export function saleLine(lang: PostLang, discountLabel: string, count: number): string {
  switch (lang) {
    case 'ja': return `${discountLabel}！対象${count}作品が特別価格でラインナップ`
    case 'en': return `${discountLabel} — ${count} titles now at special prices`
    case 'zh': return `${discountLabel}！${count}部作品特惠上架`
  }
}

/** 本日の注目新作（単品）の本文行（言語別）。title は日本語のまま短縮。 */
export function pickLine(
  lang: PostLang,
  name: string | null,
  title: string | null,
  releaseDate: string | null,
): string {
  const nm = name ?? ''
  const date = releaseDate ? `（${releaseDate}）` : ''
  switch (lang) {
    case 'ja': return `${nm}${title ? `『${title}』` : ''}${date}`.trim() || '注目の新作が登場'
    case 'en': return `${nm ? `${nm} — ` : ''}new release${date}`.trim()
    case 'zh': return `${nm ? `${nm} ` : ''}最新作${date}`.trim()
  }
}
