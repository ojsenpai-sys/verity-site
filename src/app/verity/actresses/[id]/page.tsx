export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, ShoppingCart, Bookmark, UserCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { LogView } from '@/components/LogView'
import { ShareButton } from '@/components/ShareButton'
import { withAffiliate } from '@/lib/affiliate'
import { PurchaseLink } from '@/components/PurchaseLink'
import type { Article, Actress } from '@/lib/types'

type Params = { id: string }

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('name, ruby, image_url')
    .eq('external_id', id)
    .single()
  if (!data) return {}
  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
  const rubyPart = data.ruby ? `（${data.ruby}）` : ''
  const description = `${data.name}の最新作・動画を一覧。FANZAで購入できる${data.name}のおすすめAV作品をVERITY編集部がキュレーション。`
  return {
    title: `${data.name}${rubyPart}の作品一覧`,
    description,
    alternates: { canonical: `${BASE}/actresses/${id}` },
    openGraph: {
      title:       `${data.name} — VERITY`,
      description,
      images:      data.image_url ? [{ url: data.image_url, alt: data.name }] : undefined,
    },
    twitter: {
      title:       `${data.name} — VERITY`,
      description,
      images:      data.image_url ? [data.image_url] : undefined,
    },
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

  const aliases = (actress.metadata?.aliases ?? []) as string[]
  const searchNames = [actress.name, ...aliases]

  const [{ data: upcomingData }, { data: recentData }, { data: lpRankRows }] = await Promise.all([
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .or(`published_at.gt.${now},published_at.is.null`)
      .order('published_at', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .limit(12),
    supabase.rpc('get_actress_lp_ranking', {
      p_actress_id: actress.id,
      p_brand_id:   BRAND_ID,
      p_limit:      10,
    }),
  ])

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

  type LpRankRow = { rank: number; display_name: string; lp_points: number }
  const lpRanking = (lpRankRows ?? []) as LpRankRow[]

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
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
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-[var(--text)]">{actress.name}</h1>
          {actress.ruby && (
            <p className="text-sm text-[var(--text-muted)]">{actress.ruby}</p>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            最新 {total} 作品を表示
          </p>
        </div>
        <ShareButton url={`/verity/actresses/${actress.external_id}`} title={actress.name} />
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
          <div className="pt-2 flex items-center gap-2.5 flex-wrap">
            <PurchaseLink
              href={withAffiliate(`https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(actress.name)}/`) ?? '#'}
              targetId={actress.external_id}
              actionType="purchase_click"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
            >
              <ShoppingCart size={13} />
              FANZAで{actress.name}の全作品を検索
            </PurchaseLink>
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
              PR
            </span>
          </div>
        </section>
      )}

      {/* 宣伝担当ランキング */}
      {lpRanking.length > 0 && (
        <section className="space-y-4">
          {/* スプレーアート風ヘッダー */}
          <div className="relative overflow-hidden rounded-2xl px-6 py-5"
            style={{
              background: 'linear-gradient(135deg, #0a0a0f 0%, #150a20 50%, #0a0f1a 100%)',
              border: '1px solid rgba(226,0,116,0.25)',
            }}>
            {/* 背景グリッドライン演出 */}
            <div className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'linear-gradient(rgba(226,0,116,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.6) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }} />
            <div className="relative z-10 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/verity/king.png" alt="" width={22} height={22} style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.7))' }} />
              <div>
                <p className="text-xs font-black tracking-[0.2em] uppercase" style={{ color: '#E20074' }}>
                  宣伝担当ランキング
                </p>
                <p className="text-[10px]" style={{ color: 'rgba(240,240,248,0.5)' }}>
                  {actress.name}に最も LP を捧げた推し人
                </p>
              </div>
            </div>
          </div>

          {/* ランキングリスト */}
          <ol className="space-y-2">
            {lpRanking.map((row, i) => {
              const isTop3  = i < 3
              const rankColors = ['#fbbf24', '#94a3b8', '#b45309']
              const glowColors = ['rgba(251,191,36,0.3)', 'rgba(148,163,184,0.2)', 'rgba(180,83,9,0.2)']
              return (
                <li key={i} className="relative overflow-hidden rounded-xl px-4 py-3 flex items-center gap-4"
                  style={{
                    background:  isTop3
                      ? `linear-gradient(90deg, rgba(0,0,0,0.6), ${glowColors[i]}20, rgba(0,0,0,0.6))`
                      : 'rgba(18,18,26,0.8)',
                    border: isTop3
                      ? `1px solid ${rankColors[i]}30`
                      : '1px solid rgba(42,42,58,0.6)',
                    boxShadow: isTop3 ? `0 0 20px ${glowColors[i]}` : 'none',
                  }}>
                  {/* ランク番号 */}
                  <span className="w-8 shrink-0 text-center text-sm font-black font-mono"
                    style={{ color: isTop3 ? rankColors[i] : 'rgba(136,136,170,0.6)',
                             textShadow: isTop3 ? `0 0 8px ${rankColors[i]}` : 'none' }}>
                    {i < 9 ? `0${i + 1}` : `${i + 1}`}
                  </span>

                  {/* ユーザー名 */}
                  <span className="flex-1 min-w-0 truncate font-bold text-sm"
                    style={{
                      color:       isTop3 ? '#f0f0f8' : 'rgba(240,240,248,0.7)',
                      textShadow:  isTop3 ? `0 0 12px ${rankColors[i]}40` : 'none',
                      letterSpacing: '0.03em',
                    }}>
                    {row.display_name}
                  </span>

                  {/* LP ポイント */}
                  <span className="shrink-0 font-black text-sm font-mono"
                    style={{
                      color:      isTop3 ? rankColors[i] : '#8888aa',
                      textShadow: isTop3 ? `0 0 10px ${rankColors[i]}` : 'none',
                    }}>
                    💙 {row.lp_points} LP
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
