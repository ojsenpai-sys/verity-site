export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { Sparkles, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import { getAllFeatures } from '@/lib/features'
import type { Article } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export async function generateMetadata() {
  return {
    title: 'VERITY Spotlight — 特集一覧',
    description: 'VERITYが厳選した注目女優の深掘り編集特集。話題の新人から実力派まで、作品DBではなく「推し活・発見・応援」のための特集コンテンツ。',
    alternates: { canonical: `${BASE}/verity/features` },
    openGraph: {
      title: 'VERITY Spotlight — 特集一覧',
      description: 'VERITYが厳選した注目女優の深掘り編集特集。',
    },
  }
}

async function getLatestArticle(tag: string): Promise<Article | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, published_at, slug')
    .eq('is_active', true)
    .contains('tags', [tag])
    .order('published_at', { ascending: false })
    .limit(1)
    .single()
  return (data as Article | null) ?? null
}

function proxied(article: Article): string {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default async function FeaturesIndexPage() {
  const features = getAllFeatures()

  // 各特集の最新記事を並行取得（ヒーロー画像用）
  const articles = await Promise.all(features.map((f) => getLatestArticle(f.actressTag)))

  return (
    <div className="min-h-screen bg-[#0a0800]">
      {/* ── ヘッダー ── */}
      <div className="relative overflow-hidden border-b border-[#d4af37]/20">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,175,55,0.16) 0%, transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 py-14 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/8 px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase text-[#d4af37]">
            <Sparkles size={11} />
            VERITY Spotlight
          </div>
          <h1
            className="text-3xl sm:text-4xl font-black tracking-tight text-[#d4af37]"
            style={{ textShadow: '0 0 40px rgba(212,175,55,0.45)' }}
          >
            特集一覧
          </h1>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-white/50">
            作品DBではなく「なぜ今この女優が注目されているのか」を伝える編集特集。
            ファンが保存したくなり、SNSでシェアされる深掘りコンテンツをストックしています。
          </p>
        </div>
      </div>

      {/* ── 特集グリッド ── */}
      <div className="mx-auto max-w-5xl px-4 py-12">
        {features.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/30 space-y-3">
            <p className="text-4xl">✦</p>
            <p className="text-sm">特集を準備中です</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => {
              const article = articles[i]
              return (
                <Link
                  key={feature.slug}
                  href={`/verity/features/${feature.slug}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#d4af37]/20 bg-black/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-[0_0_32px_rgba(212,175,55,0.18)]"
                >
                  {/* 画像エリア */}
                  <div className="relative aspect-[16/9] overflow-hidden bg-[#0d0a00]">
                    {article && (
                      <>
                        <ProxiedImage
                          src={proxied(article)}
                          alt={feature.actressName}
                          className="absolute inset-0 h-full w-full object-cover object-right opacity-60 transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      </>
                    )}
                    {!article && (
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(212,175,55,0.08) 0%, transparent 100%)',
                        }}
                      />
                    )}

                    {/* シリーズバッジ */}
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-[#d4af37]/50 bg-[#0a0800]/80 px-2.5 py-0.5 text-[9px] font-bold tracking-widest uppercase text-[#d4af37] backdrop-blur-sm">
                      <Sparkles size={8} />
                      {feature.seriesLabel}
                    </span>

                    {/* 女優名オーバーレイ */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-xl font-black text-[#d4af37]"
                        style={{ textShadow: '0 0 24px rgba(212,175,55,0.6)' }}>
                        {feature.actressName}
                      </p>
                    </div>
                  </div>

                  {/* テキスト */}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <p className="text-[12px] leading-relaxed text-white/60 line-clamp-2">
                      {feature.tagline}
                    </p>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[10px] text-[#d4af37]/40">
                        {fmtDate(feature.publishedAt)}
                      </span>
                      <span className="flex items-center gap-0.5 text-[11px] font-bold text-[#d4af37]/60 transition-colors group-hover:text-[#d4af37]">
                        特集を読む
                        <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="mx-auto max-w-4xl px-4 pb-16 text-center">
        <Link
          href="/verity"
          className="text-sm text-white/25 transition-colors hover:text-[#d4af37]/50"
        >
          ← VERITYトップへ
        </Link>
      </div>
    </div>
  )
}
