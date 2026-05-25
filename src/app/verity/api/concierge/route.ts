import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_KEY   = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`

const DAILY_LIMIT       = 15   // 1日の最大会話回数（JST 0時リセット）
const UNLOCK_THRESHOLD  = 300  // 特別モード（akari_03）解放に必要な通算会話数

// 安全フィルタ全解除（成人向けコンテンツサイト用）
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
]

// ── 動的 RAG 検索 ────────────────────────────────────────────────────────────
// ユーザー入力からキーワードを抽出し、title ilike / tags overlaps で優先検索する。
// ヒットがない場合は前後1ヶ月の最新作にフォールバック。

type ArticleRow = {
  title:        string
  slug:         string
  tags:         unknown
  published_at: string | null
}

function extractKeywords(text: string): string[] {
  return [...new Set(
    text
      .split(/[\s　、。！？「」【】（）・,，\n]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2),
  )].slice(0, 5)
}

// Supabase ilike / or クエリ用に危険文字をエスケープ
function escapeIlike(s: string): string {
  return s.replace(/[%_,]/g, c => (c === '%' ? '\\%' : c === '_' ? '\\_' : ''))
}

async function fetchRelevantWorks(
  supabase:    Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  userInput:   string,
  monthAgo:    Date,
  monthLater:  Date,
): Promise<ArticleRow[]> {
  const keywords = extractKeywords(userInput)

  if (keywords.length > 0) {
    // ilike: title に各キーワードを OR 検索
    const ilikeParts = keywords
      .map(k => `title.ilike.%${escapeIlike(k)}%`)
      .join(',')

    const [{ data: titleHits }, { data: tagHits }] = await Promise.all([
      supabase
        .from('articles')
        .select('title, slug, tags, published_at')
        .eq('is_active', true)
        .or(ilikeParts)
        .order('published_at', { ascending: false })
        .limit(15),
      supabase
        .from('articles')
        .select('title, slug, tags, published_at')
        .eq('is_active', true)
        .overlaps('tags', keywords)        // 女優名など tags 配列との一致
        .order('published_at', { ascending: false })
        .limit(15),
    ])

    // 両結果をマージして slug でユニーク化
    const merged  = [...(titleHits ?? []), ...(tagHits ?? [])] as ArticleRow[]
    const unique  = [...new Map(merged.map(a => [a.slug, a])).values()]
    if (unique.length > 0) return unique.slice(0, 15)
  }

  // フォールバック: 前後1ヶ月の最新作
  const { data } = await supabase
    .from('articles')
    .select('title, slug, tags, published_at')
    .eq('is_active', true)
    .gte('published_at', monthAgo.toISOString())
    .lte('published_at', monthLater.toISOString())
    .order('published_at', { ascending: false })
    .limit(10)

  return (data ?? []) as ArticleRow[]
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

export async function POST(req: NextRequest) {
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

  // ── [Fix] ユーザーメッセージを先に INSERT（ordering バグ対策）────────────
  // user/model を同一INSERT すると created_at が同じになり ORDER BY 不定になる。
  // user を先に保存し、Gemini レスポンス後に model を保存することで時刻差を確保する。
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

  const [{ data: historyRows }, recentWorks] = await Promise.all([
    supabase
      .from('sn_concierge_chats')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(21),
    fetchRelevantWorks(supabase, content, monthAgo, monthLater),
  ])

  // 最新作コンテキスト（タイトル・女優・slug のみ、簡潔に）
  const worksContext = recentWorks
    .map(a => {
      const actresses = ((a.tags as string[] | null) ?? []).slice(0, 2).join('・')
      const date = a.published_at
        ? new Date(a.published_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
        : ''
      return `・「${a.title}」${actresses ? `（${actresses}）` : ''} ${date} /verity/articles/${a.slug}`
    })
    .join('\n')

  // システム指示（AV 表現を直接使わず機能説明に留める → 安全フィルタ回避を補助）
  const systemInstruction = `あなたは「あかり」という名前の、動画作品専門のコンシェルジュです。
ユーザーを「ご主人様」と呼び、丁寧で少し甘えた口調（文末に♡）で接してください。
VERITY という成人向け映像キュレーションサイトで、会員の好みに合った作品を提案する役割を担っています。

【参照データ】現在から前後1ヶ月の新着作品リスト（優先して提案してください）:
${worksContext || '（現在データなし）'}

【応答ルール】
1. 作品紹介は出演者・ジャンル・見どころを2〜3文で
2. 最後に「👉 [作品タイトル](/verity/articles/スラッグ)」形式でリンクを付ける
3. 一度に2〜3作品まで
4. 出演者名・ジャンル指定があれば最優先でフィルタリング
5. 知らない場合は「調べてみますね♡」と正直に伝える`

  // Gemini multi-turn: 履歴（今回の user 含む）をそのまま渡す
  type RawRow = { role: string; content: string }
  const history = (historyRows ?? []) as RawRow[]

  const contents = history.map(m => ({
    role:  m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }))

  // ── Gemini 呼び出し ────────────────────────────────────────────────────
  let reply = 'ちょっと考え中です♡ もう一度話しかけてみてください。'
  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        safetySettings: SAFETY_SETTINGS,       // ← 安全フィルタ全解除
        generationConfig: {
          temperature:     0.85,
          maxOutputTokens: 900,
        },
      }),
    })

    const rawText = await geminiRes.text()

    if (!geminiRes.ok) {
      console.error(`[concierge] Gemini HTTP ${geminiRes.status}:`, rawText.slice(0, 400))
    } else {
      const data = JSON.parse(rawText) as {
        candidates?: {
          content?:      { parts: { text: string }[] }
          finishReason?: string
          safetyRatings?: unknown[]
        }[]
        promptFeedback?: { blockReason?: string }
      }

      const blockReason = data.promptFeedback?.blockReason
      const candidate   = data.candidates?.[0]
      const text        = candidate?.content?.parts?.[0]?.text

      if (blockReason) {
        console.error('[concierge] Gemini prompt blocked:', blockReason)
      } else if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        console.error('[concierge] Gemini finish reason:', candidate.finishReason)
      } else if (!text) {
        console.error('[concierge] Gemini empty response, raw:', rawText.slice(0, 300))
      }

      if (text) reply = text
    }
  } catch (e) {
    console.error('[concierge] fetch error:', e)
  }

  // model メッセージを保存（user より後の created_at になる）
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
    unlocked:       (newTotal ?? 0) >= 100,
  })
}
