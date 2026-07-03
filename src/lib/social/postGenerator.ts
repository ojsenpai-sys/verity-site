/**
 * 正規化ペイロード（PostData）から ja / en / zh / all の投稿文を生成する。
 * 決定論的なテンプレート合成のみ（LLM 不使用）。
 */

import {
  PERIOD_LABEL,
  HEADLINE,
  CTA,
  hashtagsFor,
  mergedHashtags,
  saleLine,
  pickLine,
} from './templates'
import { tweetWeightedLength, isOverTweetLimit } from './tweetLength'
import type { PostData, PostItem, PostLang, PostLangOrAll, PostVariant } from './types'

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function truncate(s: string, n: number): string {
  const chars = [...s]
  return chars.length <= n ? s : `${chars.slice(0, n).join('')}…`
}

/** ランキング1行: メダル/番号 + 名前 + メトリクス（言語ニュートラル）。 */
function renderItem(item: PostItem): string {
  const marker = MEDALS[item.rank] ?? `${item.rank}.`
  const metric = item.metric ? ` ${item.metric}` : ''
  return `${marker} ${item.name}${metric}`
}

/** 単一言語（ja/en/zh）の本文。 */
function buildSingle(data: PostData, lang: PostLang): string {
  const key = data.templateKey
  const lines: string[] = []

  if (key === 'ranking_works') {
    const period = PERIOD_LABEL[lang][data.periodLabel ?? 'overall']
    lines.push(HEADLINE[key][lang].replace('{period}', period))
  } else {
    lines.push(HEADLINE[key][lang])
  }
  lines.push('')

  if (key === 'sale') {
    lines.push(saleLine(lang, data.sale?.discountLabel ?? 'セール中', data.sale?.count ?? 0))
  } else if (key === 'new_todays_pick') {
    const p = data.singlePick
    lines.push(pickLine(lang, p?.name ?? null, p?.title ? truncate(p.title, 24) : null, p?.releaseDate ?? null))
  } else {
    for (const it of data.items) lines.push(renderItem(it))
  }

  lines.push('')
  lines.push(CTA[key][lang])
  lines.push(hashtagsFor(key, lang).join(' '))
  lines.push(data.url)
  return lines.join('\n')
}

/** 多言語まとめ（all）: 3 言語見出し + 共有アイテム + マージ済みタグ。 */
function buildAll(data: PostData): string {
  const key = data.templateKey
  const hl = [HEADLINE[key].ja, HEADLINE[key].en, HEADLINE[key].zh]
    .map((h) => h.replace('{period}', ''))
    .join(' / ')
  const lines: string[] = [hl, '']

  if (key === 'sale') {
    const label = data.sale?.discountLabel ?? 'SALE'
    const count = data.sale?.count ?? 0
    lines.push(`${label} · ${count} titles`)
  } else if (key === 'new_todays_pick') {
    const p = data.singlePick
    const name = p?.name ?? ''
    lines.push(`${name}${p?.title ? ` 『${truncate(p.title, 20)}』` : ''}`.trim() || 'New release')
  } else {
    for (const it of data.items) lines.push(renderItem(it))
  }

  lines.push('')
  lines.push(mergedHashtags(key).join(' '))
  lines.push(data.url)
  return lines.join('\n')
}

function toVariant(body: string): PostVariant {
  return { body, weighted: tweetWeightedLength(body), overLimit: isOverTweetLimit(body) }
}

/** ja / en / zh / all の全バリアントを一括生成。 */
export function generatePost(data: PostData): Record<PostLangOrAll, PostVariant> {
  return {
    ja: toVariant(buildSingle(data, 'ja')),
    en: toVariant(buildSingle(data, 'en')),
    zh: toVariant(buildSingle(data, 'zh')),
    all: toVariant(buildAll(data)),
  }
}
