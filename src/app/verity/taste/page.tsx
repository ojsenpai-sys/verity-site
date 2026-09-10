import type { Metadata } from 'next'
import { getTasteCandidatePool } from '@/lib/taste/pool'
import { TasteApp } from '@/components/taste/TasteApp'

export const metadata: Metadata = {
  title: 'Taste Check',
  description: '気になる作品を直感で選ぶだけ。VERITYがあなたに合いそうな作品と女優を見つけます。',
}

export default async function TastePage() {
  // Supabase一時障害時も pool.ts 側で空プールにフォールバックする
  // （Taste機能単体の失敗でVERITY全体を巻き込まない）。
  const pool = await getTasteCandidatePool()

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[var(--bg)]">
      <TasteApp pool={pool} />
    </div>
  )
}
