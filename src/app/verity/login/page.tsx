import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'ログイン — VERITY',
  description: 'VERITYメンバー限定コンテンツへのアクセス',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  // ログイン済みならプロフィールへ
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/verity/profile')

  const { error, next } = await searchParams

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <LoginForm error={error} next={next} />
    </div>
  )
}
