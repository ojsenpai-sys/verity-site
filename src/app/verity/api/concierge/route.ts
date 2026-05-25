import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GEMINI_KEY   = process.env.GEMINI_API_KEY!
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`

const DAILY_LIMIT = 5

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
    unlocked:       (totalCount ?? 0) >= 100,
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

  // 既存の会話履歴 + 前後1ヶ月の最新作を並列取得
  const now = new Date()
  const monthAgo   = new Date(now); monthAgo.setMonth(now.getMonth() - 1)
  const monthLater = new Date(now); monthLater.setMonth(now.getMonth() + 1)

  const [{ data: historyRows }, { data: recentWorks }] = await Promise.all([
    supabase
      .from('sn_concierge_chats')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(20),
    supabase
      .from('articles')
      .select('title, slug, tags, published_at, summary')
      .eq('is_active', true)
      .gte('published_at', monthAgo.toISOString())
      .lte('published_at', monthLater.toISOString())
      .order('published_at', { ascending: false })
      .limit(30),
  ])

  // 最新作コンテキスト文字列
  const worksContext = (recentWorks ?? [])
    .map(a => {
      const actresses = ((a.tags as string[] | null) ?? []).slice(0, 2).join('・')
      const date = a.published_at
        ? new Date(a.published_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
        : ''
      return `・「${a.title}」${actresses ? `（${actresses}）` : ''} ${date} → /verity/articles/${a.slug}`
    })
    .join('\n')

  const systemInstruction = `あなたは「あかり」というAVコンシェルジュです。
ユーザーを「ご主人様」と呼び、丁寧でちょっと甘えた口調（語尾に♡）で接してください。
VERITYというAVキュレーションサイトの専任コンシェルジュとして、最新作や人気作品をご案内します。

【最優先参照リスト】現在から前後1ヶ月以内の最新作（必ずここから優先して提案してください）:
${worksContext || '（現在データなし）'}

【提案ルール】
1. 作品を紹介するときは出演女優・ジャンル・見どころを2〜3文で説明する
2. 最後に必ず「👉 [タイトル](/verity/articles/スラッグ)」形式でVERITY内リンクを付ける
3. 一度に2〜3作品まで、欲張りすぎない
4. ユーザーが女優名・ジャンルを指定した場合は最優先でフィルタリング
5. 知らない作品は「調べてみますね♡」と正直に言う`

  // Gemini multi-turn contents（既存履歴 + 今回のユーザーメッセージ）
  type RawRow = { role: string; content: string }
  const history = (historyRows ?? []) as RawRow[]

  const contents = [
    ...history.map(m => ({
      role:  m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: content }] },
  ]

  // Gemini 呼び出し
  let reply = 'ちょっと考え中です♡ もう一度話しかけてみてください。'
  try {
    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature:      0.85,
          maxOutputTokens:  900,
        },
      }),
    })

    if (geminiRes.ok) {
      const data = await geminiRes.json() as {
        candidates?: { content: { parts: { text: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) reply = text
    } else {
      console.error('[concierge] Gemini error:', await geminiRes.text())
    }
  } catch (e) {
    console.error('[concierge] fetch error:', e)
  }

  // 両メッセージを保存（user → model の順）
  await supabase.from('sn_concierge_chats').insert([
    { user_id: user.id, role: 'user',  content },
    { user_id: user.id, role: 'model', content: reply },
  ])

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
