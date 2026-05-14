/**
 * Gemini API を使ったニュース記事自動生成
 *
 * パッケージ依存なし — fetch で REST API を直接叩く。
 * モデル: gemini-2.0-flash（高速・低コスト）
 * 環境変数: GEMINI_API_KEY
 */

const GEMINI_MODEL   = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ── 入力型 ──────────────────────────────────────────────────────────────────

export type ArticleInput = {
  cid:          string
  title:        string
  actressName:  string
  actressRuby?: string | null
  makerName:    string
  labelName?:   string | null
  seriesName?:  string | null
  genres:       string[]
  imageUrl:     string | null
  affiliateUrl: string | null
  publishedAt:  string | null   // ISO 8601
}

export type GeneratedNews = {
  title:   string
  slug:    string
  summary: string
  content: string
  tags:    string[]
}

// ── プロンプト生成 ───────────────────────────────────────────────────────────

function buildPrompt(input: ArticleInput): string {
  const releaseDate = input.publishedAt
    ? new Date(input.publishedAt).toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
      })
    : '近日配信予定'

  const makerFull = [input.makerName, input.labelName].filter(Boolean).join(' / ')
  const genreStr  = input.genres.slice(0, 6).join('・')

  return `あなたは音楽ナタリー・映画ナタリーのスタイルで執筆するエンタメ専門ライターです。
以下の作品データをもとに、誠実・熱量高め・事実ベースのニュース記事を日本語で生成してください。

【作品データ】
タイトル: ${input.title}
出演: ${input.actressName}${input.actressRuby ? `（${input.actressRuby}）` : ''}
メーカー: ${makerFull}
${input.seriesName ? `シリーズ: ${input.seriesName}` : ''}
ジャンル: ${genreStr}
リリース日: ${releaseDate}

【執筆ルール】
1. 露骨な性的表現は一切使わない。「映像表現」「演技力」「作品のテーマ」「存在感」「パフォーマンス」「魅力」「表情」「世界観」といったエンタメ・芸術的な語彙に変換する。
2. 読者の想像力を刺激する、上品かつプロフェッショナルな文体を維持する。
3. 事実に基づいて書く（捏造しない）。
4. 音楽ナタリーのような熱量と敬意をもって、その作品と女優の魅力を最大限に伝える。
5. 女優名は記事全体で3〜5回自然に登場させる。

【出力形式（JSON のみ返すこと）】
{
  "title": "キャッチーなニュース記事タイトル（35文字以内、女優名を含む）",
  "summary": "リード文（60〜90文字。配信日・女優名・作品の核心を事実ベースで1文にまとめる）",
  "content": "本文（Markdown 形式、600〜900文字）\n\n構成:\n## 見どころ\n（この作品ならではの演技・世界観・テーマを2〜3段落で紹介）\n\n## リリース情報\n（配信日・メーカー・ジャンル・入手方法などの事実情報）",
  "tags": ["タグ1", "タグ2", "タグ3", "タグ4", "タグ5"]
}`
}

// ── Gemini API 呼び出し ─────────────────────────────────────────────────────

const MAX_RETRIES = 3

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[ai] GEMINI_API_KEY が未設定です')

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.75,
          maxOutputTokens:  2048,
          responseMimeType: 'application/json',
          thinkingConfig:   { thinkingBudget: 0 },
        },
      }),
      cache: 'no-store',
    })

    // 429 レート制限: 指数バックオフで最大 MAX_RETRIES 回リトライ
    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      const retryAfter = res.headers.get('Retry-After')
      const delay = retryAfter ? Number(retryAfter) * 1000 : 2000 * Math.pow(2, attempt)
      console.warn(`[ai] Gemini 429 — ${delay}ms 後にリトライ (${attempt + 1}/${MAX_RETRIES - 1})`)
      await new Promise(r => setTimeout(r, delay))
      continue
    }

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`[ai] Gemini API ${res.status}: ${body.slice(0, 300)}`)
    }

    const json = await res.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> }
      }>
    }
    // thinking parts を除外してテキスト部分だけ結合
    const parts = json?.candidates?.[0]?.content?.parts ?? []
    const text  = parts
      .filter(p => !p.thought)
      .map(p => p.text ?? '')
      .join('')
      .trim()

    if (!text) throw new Error('[ai] Gemini から空レスポンスが返されました')
    return text
  }

  throw new Error('[ai] Gemini API: レート制限により最大リトライ回数を超えました')
}

// ── スラッグ生成 ─────────────────────────────────────────────────────────────

export function buildNewsSlug(cid: string): string {
  return `ai-${cid}`
}

// ── メイン関数 ──────────────────────────────────────────────────────────────

export async function generateNewsFromArticle(
  input: ArticleInput,
  overrideSlug?: string,
): Promise<GeneratedNews> {
  console.log(`[ai] 生成開始: cid=${input.cid} actress=${input.actressName}`)

  const prompt = buildPrompt(input)
  const raw    = await callGemini(prompt)

  let parsed: { title: string; summary: string; content: string; tags: string[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    // JSON パース失敗時は raw テキストをデバッグ出力してリスロー
    console.error('[ai] JSONパース失敗:', raw.slice(0, 400))
    throw new Error('[ai] Gemini レスポンスが有効な JSON ではありません')
  }

  if (!parsed.title || !parsed.content) {
    throw new Error('[ai] 必須フィールド (title/content) が欠けています')
  }

  const slug = overrideSlug ?? buildNewsSlug(input.cid)

  console.log(`[ai] 生成完了: slug=${slug} title=${parsed.title.slice(0, 30)}`)

  return {
    title:   parsed.title,
    slug,
    summary: parsed.summary ?? '',
    content: parsed.content,
    tags:    Array.isArray(parsed.tags) ? parsed.tags : [],
  }
}

// ── articles テーブル行から ArticleInput を組み立てるヘルパー ──────────────

export type ArticleRow = {
  external_id:  string
  title:        string
  image_url:    string | null
  published_at: string | null
  tags:         string[] | null
  metadata:     unknown
}

export function articleRowToInput(row: ArticleRow): ArticleInput | null {
  const meta = row.metadata as Record<string, unknown> | null
  if (!meta) return null

  const actresses  = (meta.actress  as Array<{ id: number; name: string; ruby?: string }> | undefined) ?? []
  const makers     = (meta.maker    as Array<{ id: number; name: string }> | undefined) ?? []
  const labels     = (meta.label    as Array<{ id: number; name: string }> | undefined) ?? []
  const seriesList = (meta.series   as Array<{ id: number; name: string }> | undefined) ?? []
  const genres     = (row.tags ?? []).filter(t =>
    !actresses.some(a => a.name === t)
  )

  if (actresses.length === 0) return null

  const actress = actresses[0]

  return {
    cid:          row.external_id,
    title:        row.title,
    actressName:  actress.name,
    actressRuby:  actress.ruby ?? null,
    makerName:    makers[0]?.name  ?? 'Unknown',
    labelName:    labels[0]?.name  ?? null,
    seriesName:   seriesList[0]?.name ?? null,
    genres,
    imageUrl:     row.image_url,
    affiliateUrl: (meta.affiliate_url as string | null) ?? null,
    publishedAt:  row.published_at,
  }
}
