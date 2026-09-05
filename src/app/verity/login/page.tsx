import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { createClient } from '@/lib/supabase/server'
import { safeGetUser } from '@/lib/supabase/authUser'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'ログイン — VERITY',
  description: 'VERITYメンバー限定コンテンツへのアクセス',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; mode?: string }>
}) {
  // ログイン済みならプロフィールへ。Auth基盤の障害/timeout時は判定できないため
  // (Phase 3.2.5)、安全側としてログインフォームをそのまま表示する
  // （既にログイン済みのユーザーが不要にフォームを見るだけで、実害はない）。
  const supabase = await createClient()
  const authResult = await safeGetUser(supabase, 'login')
  if (authResult.status === 'authenticated') redirect('/verity/profile')

  const { error, next, mode } = await searchParams

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <LoginForm error={error} next={next} mode={mode === 'signup' ? 'signup' : 'login'} />
    </div>
  )
}
