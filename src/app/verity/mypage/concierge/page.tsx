import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ConciergeClient } from './ConciergeClient'

export const metadata: Metadata = {
  title: 'あかり部屋 — VERITY',
  description: 'あかりコンシェルジュに気になる作品を提案してもらおう',
}

export const dynamic = 'force-dynamic'

export type ChatMessage = {
  id:         string
  role:       'user' | 'model'
  content:    string
  created_at: string
}

// JST 今日 00:00:00 を UTC で返す
function todayJstStart(): string {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  jst.setUTCHours(0, 0, 0, 0)
  return new Date(jst.getTime() - 9 * 60 * 60 * 1000).toISOString()
}

// 機能一時停止フラグ — true のとき画面を封鎖しマイページへリダイレクト
const CONCIERGE_DISABLED = true

export default async function ConciergePageRoute() {
  if (CONCIERGE_DISABLED) redirect('/verity/profile')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/verity/login?next=/verity/mypage/concierge')

  const todayStart = todayJstStart()

  const [
    { data: rawMessages },
    { count: dailyCount },
    { count: totalCount },
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
      .eq('role', 'user')
      .gte('created_at', todayStart),
    supabase
      .from('sn_concierge_chats')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user'),
  ])

  const messages = (rawMessages ?? []) as ChatMessage[]
  const daily    = dailyCount ?? 0
  const total    = totalCount ?? 0

  return (
    <ConciergeClient
      initialMessages={messages}
      initialDailyCount={daily}
      initialTotalCount={total}
      initialUnlocked={total >= 100}
    />
  )
}
