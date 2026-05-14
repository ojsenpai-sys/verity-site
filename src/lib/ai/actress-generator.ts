/**
 * Gemini 2.5 Flash を使った女優プロフィール自動生成
 * 環境変数: GEMINI_API_KEY
 */

const GEMINI_MODEL   = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// ── 入力型 ──────────────────────────────────────────────────────────────────

export type ActressProfileInput = {
  dmmId:    number
  name:     string
  ruby:     string | null
  articles: Array<{
    title:       string
    tags:        string[]
    makerName:   string
    publishedAt: string | null
  }>
}

export type GeneratedActressProfile = {
  externalId: string
  name:       string
  ruby:       string | null
  bio:        string
  features:   string[]
  debutYear:  number | null
  tags:       string[]
}

// ── プロンプト ───────────────────────────────────────────────────────────────

function buildPrompt(input: ActressProfileInput): string {
  const makers = [...new Set(input.articles.map(a => a.makerName).filter(Boolean))]
  const allTags = [...new Set(input.articles.flatMap(a => a.tags).filter(t => t !== input.name))]

  const articleLines = input.articles
    .slice(0, 5)
    .map(a => {
      const date = a.publishedAt
        ? new Date(a.publishedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', timeZone: 'Asia/Tokyo' })
        : '不明'
      const genres = a.tags.filter(t => t !== input.name).slice(0, 4).join('・')
      return `- 「${a.title.slice(0, 40)}」(${date})${genres ? ` ジャンル: ${genres}` : ''}`
    })
    .join('\n')

  return `あなたは映画・音楽ナタリーのスタイルで人物紹介文を書くプロのライターです。
以下のデータを基に、女優のプロフィール紹介文を日本語で生成してください。

【女優情報】
名前: ${input.name}${input.ruby ? `（${input.ruby}）` : ''}
所属メーカー: ${makers.join(' / ') || '不明'}
ジャンル傾向: ${allTags.slice(0, 8).join('・')}
出演作品:
${articleLines}

【執筆ルール】
1. 露骨な性的表現を一切使わない。「演技力」「存在感」「表現の幅」「世界観」「パフォーマンス」「魅力」といった語彙を使う。
2. その女優固有の魅力・スタイルを具体的に述べる。
3. ラグジュアリーかつプロフェッショナルなトーンを維持する。
4. 事実を基にし、捏造しない。

【出力形式（JSONのみ返すこと）】
{
  "bio": "プロフィール文（150〜250文字）",
  "features": ["特徴・スタイルを示す短いフレーズ（3〜5個）"],
  "debut_year": デビュー推定年（数値、不明なら null）,
  "tags": ["女優の特徴タグ（3〜6個）"]
}`
}

// ── Gemini 呼び出し ─────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('[ai:actress] GEMINI_API_KEY が未設定です')

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature:      0.70,
        maxOutputTokens:  1024,
        responseMimeType: 'application/json',
        thinkingConfig:   { thinkingBudget: 0 },
      },
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[ai:actress] Gemini API ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    }>
  }
  const text = (json?.candidates?.[0]?.content?.parts ?? [])
    .filter(p => !p.thought)
    .map(p => p.text ?? '')
    .join('')
    .trim()

  if (!text) throw new Error('[ai:actress] Gemini から空レスポンスが返されました')
  return text
}

// ── メイン関数 ──────────────────────────────────────────────────────────────

export async function generateActressProfile(
  input: ActressProfileInput,
): Promise<GeneratedActressProfile> {
  console.log(`[ai:actress] 生成開始: ${input.name} (dmm-actress-${input.dmmId})`)

  const prompt = buildPrompt(input)
  const raw    = await callGemini(prompt)

  let parsed: { bio: string; features: string[]; debut_year: number | null; tags: string[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error('[ai:actress] JSONパース失敗:', raw.slice(0, 300))
    throw new Error('[ai:actress] Gemini レスポンスが有効な JSON ではありません')
  }

  console.log(`[ai:actress] 生成完了: ${input.name}`)

  return {
    externalId: `dmm-actress-${input.dmmId}`,
    name:       input.name,
    ruby:       input.ruby,
    bio:        parsed.bio ?? '',
    features:   Array.isArray(parsed.features) ? parsed.features : [],
    debutYear:  parsed.debut_year ?? null,
    tags:       Array.isArray(parsed.tags) ? parsed.tags : [],
  }
}
