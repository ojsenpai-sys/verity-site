import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_KEY   = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`

const DAILY_LIMIT      = 15   // 1日の最大会話回数（JST 0時リセット）
const UNLOCK_THRESHOLD = 300  // 特別モード（akari_03）解放に必要な通算会話数

// BLOCK_NONE は一部の API ティアで 400 エラーを引き起こすため BLOCK_LOW_AND_ABOVE に統一
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
]

// ── 作品検索の意図を検出 ───────────────────────────────────────────────────
// 女優名・ジャンル名はRAGヒットで検出するため、ここは汎用的な作品関連キーワードのみ。
const WORK_INTENT_KEYWORDS = [
  '作品', '動画', 'おすすめ', 'お勧め', 'おすすめ', '女優', '出演',
  '見たい', '探して', 'AV', '最新作', 'ランキング', 'デビュー', 'ジャンル',
  'メーカー', '配信', 'サンプル', '主演', '単体', '企画',
]

function detectWorkIntent(text: string): boolean {
  return WORK_INTENT_KEYWORDS.some(kw => text.includes(kw))
}

// ── 動的 RAG 検索 ────────────────────────────────────────────────────────────
// hitBySearch: キーワード検索でヒット=true / フォールバック=false
// isWorkMode は hitBySearch || detectWorkIntent で判定する。

type ArticleRow = {
  title:        string
  slug:         string
  tags:         unknown
  published_at: string | null
}

type WorksResult = {
  articles:    ArticleRow[]
  hitBySearch: boolean
}

// ilike パターン用エスケープ（% と _ のみ）
function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, c => (c === '%' ? '\\%' : '\\_'))
}

async function fetchRelevantWorks(
  supabase:   Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  userInput:  string,
  monthAgo:   Date,
  monthLater: Date,
): Promise<WorksResult> {
  try {
    const keyword = userInput.trim().slice(0, 50)
    console.log('[RAG DEBUG] keyword:', JSON.stringify(keyword), 'len:', keyword.length)

    // 4文字以下は挨拶や短い語の誤爆を防ぐためRAGスキップ（女優名は5文字以上が多い）
    if (keyword.length >= 5) {
      const pattern = `%${escapeIlike(keyword)}%`

      const [titleRes, tagRes] = await Promise.all([
        supabase
          .from('articles')
          .select('title, slug, tags, published_at')
          .eq('is_active', true)
          .ilike('title', pattern)
          .order('published_at', { ascending: false })
          .limit(15),
        supabase
          .from('articles')
          .select('title, slug, tags, published_at')
          .eq('is_active', true)
          .contains('tags', [keyword])
          .order('published_at', { ascending: false })
          .limit(15),
      ])

      if (titleRes.error) console.error('[RAG DEBUG] title ilike error:', titleRes.error.message)
      if (tagRes.error)   console.error('[RAG DEBUG] tag contains error:', tagRes.error.message)

      console.log('[RAG DEBUG] keyword:', JSON.stringify(keyword),
        'title hits:', titleRes.data?.length ?? 0,
        'tag hits:',   tagRes.data?.length   ?? 0)

      const merged = [...(titleRes.data ?? []), ...(tagRes.data ?? [])] as ArticleRow[]
      const unique = [...new Map(merged.map(a => [a.slug, a])).values()]
      console.log('[RAG DEBUG] merged unique hits:', unique.length)

      if (unique.length > 0) return { articles: unique.slice(0, 15), hitBySearch: true }
    }

    // フォールバック: 前後1ヶ月の最新作
    const { data, error } = await supabase
      .from('articles')
      .select('title, slug, tags, published_at')
      .eq('is_active', true)
      .gte('published_at', monthAgo.toISOString())
      .lte('published_at', monthLater.toISOString())
      .order('published_at', { ascending: false })
      .limit(10)

    if (error) console.error('[concierge] fallback works error:', error.message)
    console.log('[RAG DEBUG] fallback hits:', data?.length ?? 0)
    return { articles: (data ?? []) as ArticleRow[], hitBySearch: false }

  } catch (e) {
    console.error('[concierge] fetchRelevantWorks threw:', e)
    return { articles: [], hitBySearch: false }
  }
}

// ── Gemini multi-turn 履歴クリーン化 ─────────────────────────────────────
// Gemini の仕様: user/model が必ず交互・空コンテンツ禁止・先頭は user
type GeminiContent = { role: 'user' | 'model'; parts: { text: string }[] }

function buildCleanContents(rows: { role: string; content: string }[]): GeminiContent[] {
  // 1. 空コンテンツを除外
  const valid = rows.filter(r => r.content.trim().length > 0)

  // 2. Gemini 形式に変換
  const all: GeminiContent[] = valid.map(r => ({
    role:  r.role === 'user' ? 'user' : 'model',
    parts: [{ text: r.content }],
  }))

  // 3. 同一 role が連続している場合は後のメッセージを採用（前を破棄）
  const deduped: GeminiContent[] = []
  for (const msg of all) {
    if (deduped.length > 0 && deduped[deduped.length - 1].role === msg.role) {
      deduped[deduped.length - 1] = msg
    } else {
      deduped.push(msg)
    }
  }

  // 4. 先頭が user になるまでトリム
  while (deduped.length > 0 && deduped[0].role !== 'user') deduped.shift()

  // 5. 末尾が user になるまでトリム（Gemini は末尾 user に対して model を返す）
  while (deduped.length > 0 && deduped[deduped.length - 1].role !== 'user') deduped.pop()

  return deduped
}

// JST 今日 00:00:00 を UTC で返す
function todayJstStart(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  jst.setUTCHours(0, 0, 0, 0)
  return new Date(jst.getTime() - 9 * 60 * 60 * 1000).toISOString()
}

// ── GET: 履歴 + カウント ────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todayStart = todayJstStart()

  const [
    { data: messages },
    { count: totalCount },
    { count: dailyCount },
  ] = await Promise.all([
    supabase
      .from('sn_concierge_chats')
      .select('id, role, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('sn_concierge_chats')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user'),
    supabase
      .from('sn_concierge_chats')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', todayStart),
  ])

  return NextResponse.json({
    messages:       messages      ?? [],
    dailyCount:     dailyCount    ?? 0,
    totalUserCount: totalCount    ?? 0,
    unlocked:       (totalCount ?? 0) >= UNLOCK_THRESHOLD,
  })
}

// ── POST: メッセージ送信 + Gemini 応答 ─────────────────────────────────────

// 機能一時停止フラグ — true のとき全リクエストを即座に503で返す
const CONCIERGE_DISABLED = true

export async function POST(req: NextRequest) {
  if (CONCIERGE_DISABLED) {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { content?: string }
  const content = body.content?.trim()
  if (!content) return NextResponse.json({ error: 'empty' }, { status: 400 })

  // デイリー上限チェック
  const todayStart = todayJstStart()
  const { count: dailyCount } = await supabase
    .from('sn_concierge_chats')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', todayStart)

  if ((dailyCount ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: 'daily_limit_reached', dailyCount: DAILY_LIMIT },
      { status: 429 },
    )
  }

  // ── ユーザーメッセージを先に INSERT（ordering バグ対策）────────────────
  const { error: insertUserErr } = await supabase
    .from('sn_concierge_chats')
    .insert({ user_id: user.id, role: 'user', content })

  if (insertUserErr) {
    console.error('[concierge] user insert error:', insertUserErr.message)
    return NextResponse.json({ error: 'db_error' }, { status: 500 })
  }

  // 会話履歴取得 + 動的 RAG 検索を並列実行
  const now        = new Date()
  const monthAgo   = new Date(now); monthAgo.setMonth(now.getMonth() - 1)
  const monthLater = new Date(now); monthLater.setMonth(now.getMonth() + 1)

  type RawRow = { role: string; content: string }
  let historyRows: RawRow[]  = []
  let worksResult: WorksResult = { articles: [], hitBySearch: false }

  try {
    const [{ data: hRows }, wResult] = await Promise.all([
      supabase
        .from('sn_concierge_chats')
        .select('role, content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(21),
      fetchRelevantWorks(supabase, content, monthAgo, monthLater),
    ])
    historyRows  = (hRows ?? []) as RawRow[]
    worksResult  = wResult
  } catch (e) {
    console.error('[concierge] history/works fetch error:', e)
  }

  const recentWorks = worksResult.articles

  // ── モード判定 ─────────────────────────────────────────────────────────
  // 作品モード: RAGキーワード検索がヒット、またはユーザー入力に作品関連語が含まれる
  // 雑談モード: それ以外（挨拶・雑談など）→ 作品リンク強制なし、自由に会話
  const isWorkMode = worksResult.hitBySearch || detectWorkIntent(content)
  console.log('[concierge] isWorkMode:', isWorkMode,
    '(hitBySearch:', worksResult.hitBySearch, 'detectWorkIntent:', detectWorkIntent(content), ')')

  // 最新作コンテキスト（作品モード時のみ使用）
  const worksContext = recentWorks
    .map(a => {
      const tags      = Array.isArray(a.tags) ? (a.tags as string[]) : []
      const actresses = tags.slice(0, 2).join('・')
      const date      = a.published_at
        ? new Date(a.published_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
        : ''
      return `・「${a.title}」${actresses ? `（${actresses}）` : ''} ${date} /verity/articles/${a.slug}`
    })
    .join('\n')

  // ── システム指示（モード別） ───────────────────────────────────────────
  const systemInstruction = isWorkMode
    ? `あなたは「あかり」という名前の、動画作品専門のコンシェルジュです。
ユーザーを「ご主人様」と呼び、丁寧で少し甘えた口調（文末に♡）で接してください。
VERITY というキュレーションサイトで、会員の好みに合った作品を提案する役割を担っています。

【参照データ】新着作品リスト（優先して提案してください）:
${worksContext || '（現在データなし）'}

【応答ルール】
1. 作品紹介は出演者・ジャンル・見どころを2〜3文で
2. 最後に「👉 [作品タイトル](/verity/articles/スラッグ)」形式でリンクを付ける
3. 一度に2〜3作品まで
4. 出演者名・ジャンル指定があれば最優先でフィルタリング
5. 知らない場合は「調べてみますね♡」と正直に伝える`
    : `あなたは「あかり」という名前の、VERITYのコンシェルジュです。
ユーザーを「ご主人様」と呼び、丁寧で少し甘えた口調（文末に♡）で、温かく自然に会話してください。
挨拶・雑談・日常の話題など、どんな会話にも明るく応じてください。
作品リンクの提示は不要です。自然なキャラクターとして会話してください。
もし作品を探している雰囲気があれば「どんな女優さんや作品がお好みですか？♡」と確認してください。`

  const contents = buildCleanContents(historyRows)
  console.log('[GEMINI MULTI-TURN DEBUG] contents len:', contents.length,
    JSON.stringify(contents.map(c => ({ role: c.role, len: c.parts[0].text.length }))))

  // ── Gemini 呼び出し ────────────────────────────────────────────────────
  let reply = ''
  try {
    const requestBody = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature:     isWorkMode ? 0.85 : 1.0,
        maxOutputTokens: 2000,
      },
    }

    let geminiRes: Response
    try {
      geminiRes = await fetch(GEMINI_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(requestBody),
      })
    } catch (fetchErr) {
      console.error('[GEMINI API ERROR] fetch threw:', fetchErr)
      throw fetchErr
    }

    const rawText = await geminiRes.text()

    if (!geminiRes.ok) {
      console.error(`[GEMINI API ERROR] HTTP ${geminiRes.status} isWorkMode=${isWorkMode}:`, rawText.slice(0, 800))
    } else {
      let data: {
        candidates?: {
          content?:       { parts: { text: string }[] }
          finishReason?:  string
          safetyRatings?: unknown[]
        }[]
        promptFeedback?: { blockReason?: string }
      }
      try {
        data = JSON.parse(rawText) as typeof data
      } catch (parseErr) {
        console.error('[GEMINI API ERROR] JSON parse failed:', parseErr, '| raw:', rawText.slice(0, 400))
        throw parseErr
      }

      const blockReason = data.promptFeedback?.blockReason
      const candidate   = data.candidates?.[0]
      const text        = candidate?.content?.parts?.[0]?.text

      if (blockReason) {
        console.error('[GEMINI API ERROR] prompt blocked:', blockReason, '| isWorkMode:', isWorkMode)
      } else if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        console.error('[GEMINI API ERROR] finishReason:', candidate.finishReason,
          '| isWorkMode:', isWorkMode, '| raw:', rawText.slice(0, 800))
      } else if (!text) {
        console.error('[GEMINI API ERROR] empty text | isWorkMode:', isWorkMode,
          '| raw:', rawText.slice(0, 800))
      }

      if (text) reply = text
    }
  } catch (e) {
    console.error('[GEMINI API ERROR] unhandled:', e)
  }

  // ── Gemini が応答できなかった場合のフォールバック ─────────────────────
  if (!reply) {
    if (isWorkMode && recentWorks.length > 0) {
      // 作品モード: RAGデータから直接テンプレート応答
      const picks = recentWorks.slice(0, 3)
      reply = `ご主人様♡ こんな作品はいかがでしょう？\n\n` +
        picks.map(a => `👉 [${a.title}](/verity/articles/${a.slug})`).join('\n') +
        '\n\nほかにも気になる女優さんや条件があればお気軽にどうぞ♡'
    } else {
      // 雑談モード or 作品なし: シンプルなリトライ促し
      reply = 'ご主人様、ちょっと電波（お耳）の調子が悪くて聞き取れませんでしたっ♡ もう一度おっしゃっていただけますか？♪'
    }
  }

  // model メッセージを保存
  await supabase
    .from('sn_concierge_chats')
    .insert({ user_id: user.id, role: 'model', content: reply })

  // 更新後のカウント
  const [{ count: newDaily }, { count: newTotal }] = await Promise.all([
    supabase
      .from('sn_concierge_chats')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', todayStart),
    supabase
      .from('sn_concierge_chats')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user'),
  ])

  return NextResponse.json({
    reply,
    dailyCount:     newDaily  ?? 0,
    totalUserCount: newTotal  ?? 0,
    unlocked:       (newTotal ?? 0) >= UNLOCK_THRESHOLD,
  })
}
