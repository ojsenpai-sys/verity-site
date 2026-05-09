export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, ShoppingCart, Bookmark, UserCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { LogView } from '@/components/LogView'
import { actressColor } from '@/lib/actressColor'
import { withAffiliate } from '@/lib/affiliate'
import { PurchaseLink } from '@/components/PurchaseLink'
import type { Article, Actress } from '@/lib/types'

type Params = { id: string }

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('name, ruby')
    .eq('external_id', id)
    .single()
  if (!data) return {}
  return {
    title: `${data.name} — VERITY`,
    description: `${data.name}の最新作・準新作`,
  }
}

export default async function ActressPage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: actressData } = await supabase
    .from('actresses')
    .select('*')
    .eq('external_id', id)
    .eq('is_active', true)
    .single()

  if (!actressData) notFound()

  const actress = actressData as Actress
  const now = new Date().toISOString()

  // Fetch 12 candidates each so we can sort solo works first in JS.
  // NOTE: gt/lte both exclude NULL in PostgREST — undated items need explicit OR.
  const [{ data: upcomingData }, { data: recentData }] = await Promise.all([
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .contains('tags', [actress.name])
      .or(`published_at.gt.${now},published_at.is.null`)
      .order('published_at', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .contains('tags', [actress.name])
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .limit(12),
  ])

  // Sort: solo works (metadata.actress.length === 1) first, then group works — within each tier keep date order
  function soloFirst(rows: Article[]): Article[] {
    const isSolo = (a: Article) => {
      const meta = a.metadata as Record<string, unknown> | null
      return Array.isArray(meta?.actress) && (meta!.actress as unknown[]).length === 1
    }
    return [
      ...rows.filter(isSolo),
      ...rows.filter(a => !isSolo(a)),
    ].slice(0, 6)
  }

  const upcoming = soloFirst((upcomingData as Article[]) ?? [])
  const recent   = soloFirst((recentData   as Article[]) ?? [])
  const total    = upcoming.length + recent.length

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      {/* 女優ページ閲覧をログに記録（ログイン済みユーザーのみ API 側で記録） */}
      <LogView targetType="actress" targetId={actress.external_id} />

      {/* Back navigation */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          <ArrowLeft size={14} />
          ダッシュボードへ戻る
        </Link>
        <span className="text-[var(--border)]" aria-hidden>|</span>
        <Link
          href="/verity/profile"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          <UserCircle size={14} />
          マイページへ戻る
        </Link>
      </div>

      {/* Actress header */}
      <div className="flex items-center gap-5">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-3xl font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.3)] ring-4 ring-[var(--magenta)]/30"
          style={{ backgroundColor: actressColor(actress.name) }}
        >
          {actress.name[0]}
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-[var(--text)]">{actress.name}</h1>
          {actress.ruby && (
            <p className="text-sm text-[var(--text-muted)]">{actress.ruby}</p>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            最新 {total} 作品を表示
          </p>
        </div>
      </div>

      {total === 0 && (
        <p className="text-[var(--text-muted)]">作品が見つかりませんでした</p>
      )}

      {/* Pre-orders */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Bookmark size={16} className="text-sky-400" />
            <h2 className="text-base font-bold text-[var(--text)]">予約受付中</h2>
            <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
              先行予約
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {upcoming.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Recent releases */}
      {recent.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">最新作・準新作</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              今、買うべき作品
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {recent.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          {/* FANZA search link (affiliate 付き) — purchase_click をログ記録 */}
          <div className="pt-2">
            <PurchaseLink
              href={withAffiliate(`https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(actress.name)}/`) ?? '#'}
              targetId={actress.external_id}
              actionType="purchase_click"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
            >
              <ShoppingCart size={13} />
              FANZAで{actress.name}の全作品を検索
            </PurchaseLink>
          </div>
        </section>
      )}
    </div>
  )
}
