export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { ExternalLink, Heart, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import type { Article } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export async function generateMetadata() {
  return {
    title: 'ありがとうMINAMO！特設コーナー | VERITY',
    description:
      '2026年12月をもって引退することを発表したMINAMO。感謝の意を込めてこれまでの作品をピックアップして掲載します！',
    alternates: { canonical: `${BASE}/verity/special/minamo` },
    openGraph: {
      title: 'ありがとうMINAMO！特設コーナー | VERITY',
      description:
        '2026年12月をもって引退することを発表したMINAMO。感謝の意を込めてこれまでの作品をピックアップして掲載します！',
    },
  }
}

// ── データ取得 ────────────────────────────────────────────────────────────────

async function getMINAMOArticles(): Promise<Article[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .contains('tags', ['MINAMO'])
    .order('published_at', { ascending: false })
    .limit(200)

  if (error) console.error('[minamo-special]', error.message)
  return (data as Article[]) ?? []
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

function getProxiedImage(article: Article): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  const cid = article.external_id as string | null
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

function getAffiliateUrl(article: Article, isOverseas: boolean): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? (article.metadata.affiliate_url as string)
      : typeof article.metadata?.url === 'string'
      ? (article.metadata.url as string)
      : null
  return withAffiliateForRegion(raw, isOverseas)
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// ── 作品カード ────────────────────────────────────────────────────────────────

function WorkCard({
  article,
  rank,
  fanzaUrl,
}: {
  article:  Article
  rank:     number
  fanzaUrl: string | null
}) {
  const imgSrc = getProxiedImage(article)

  const card = (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[#d4af37]/20 bg-black/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-[0_0_28px_rgba(212,175,55,0.18)]">
      {/* 画像 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#0d0a00]">
        {imgSrc ? (
          <>
            <ProxiedImage
              src={imgSrc}
              alt={article.title}
              className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          </>
        ) : (
          <NowPrinting />
        )}

        {/* 順位バッジ */}
        {rank <= 3 ? (
          <span
            className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black"
            style={
              rank === 1
                ? { background: '#d4af37', color: '#0a0800' }
                : rank === 2
                ? { background: '#a8a8a8', color: '#0a0a0a' }
                : { background: '#8b5e3c', color: '#fff3e0' }
            }
          >
            {rank}
          </span>
        ) : (
          <span className="absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[9px] font-bold text-[#d4af37]/70 border border-[#d4af37]/30">
            {rank}
          </span>
        )}

        {/* デスクトップホバーオーバーレイ */}
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/50 md:flex">
          <span className="translate-y-1 scale-95 rounded-full bg-[#d4af37]/90 px-3 py-1 text-[10px] font-bold text-[#0a0800] opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
            ▶ FANZAで観る
          </span>
        </div>
      </div>

      {/* テキストエリア */}
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[11px] font-medium leading-snug line-clamp-2 text-white/85 group-hover:text-[#d4af37]/90 transition-colors">
          {article.title}
        </p>
        {article.published_at && (
          <p className="text-[9px] text-[#d4af37]/50">
            {fmtDate(article.published_at)}
          </p>
        )}
        {fanzaUrl && (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position="minamo_special"
            className="mt-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold text-[#0a0800] transition-all hover:brightness-110 bg-gradient-to-r from-[#b8960c] to-[#d4af37]"
          >
            FANZAで観る
            <ExternalLink size={9} />
          </FanzaLink>
        )}
      </div>
    </article>
  )

  return fanzaUrl ? (
    <FanzaLink
      href={fanzaUrl}
      targetId={article.external_id}
      position="minamo_card_image"
      className="contents"
    >
      {card}
    </FanzaLink>
  ) : (
    card
  )
}

// ── ページ本体 ────────────────────────────────────────────────────────────────

export default async function MinamoSpecialPage() {
  const [articles, isOverseas] = await Promise.all([
    getMINAMOArticles(),
    getIsOverseasUser(),
  ])

  return (
    <div className="min-h-screen bg-[#0a0800]">

      {/* ── ヒーローヘッダー ── */}
      <div className="relative overflow-hidden border-b border-[#d4af37]/20">
        {/* 放射状グロー */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,175,55,0.18) 0%, transparent 70%)',
          }}
        />

        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center space-y-5">
          {/* 上部バッジ */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/8 px-4 py-1.5 text-[11px] font-bold tracking-widest uppercase text-[#d4af37]">
            <Heart size={11} style={{ fill: '#d4af37', color: '#d4af37' }} />
            Memorial Special Corner
          </div>

          {/* メインタイトル */}
          <h1
            className="text-3xl sm:text-5xl font-black tracking-tight text-[#d4af37]"
            style={{ textShadow: '0 0 48px rgba(212,175,55,0.5)' }}
          >
            ありがとうMINAMO！
          </h1>
          <p className="text-base font-bold text-[#d4af37]/70 tracking-widest">
            特設コーナー
          </p>

          {/* キャッチコピー */}
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-white/55">
            2026年12月をもって引退することを発表したMINAMO。感謝の意を込めてこれまでの作品をピックアップして掲載します！
          </p>

          {/* デコライン */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <div
              className="h-px flex-1 max-w-28"
              style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.4))' }}
            />
            <Star size={12} className="text-[#d4af37]/50" />
            <span className="text-[11px] tracking-widest text-[#d4af37]/40 font-bold">
              引退まで残りわずか
            </span>
            <Star size={12} className="text-[#d4af37]/50" />
            <div
              className="h-px flex-1 max-w-28"
              style={{ background: 'linear-gradient(to left, transparent, rgba(212,175,55,0.4))' }}
            />
          </div>
        </div>
      </div>

      {/* ── 作品グリッド ── */}
      <div className="mx-auto max-w-7xl px-4 py-12 space-y-8">

        {/* セクションヘッダー */}
        <div className="flex items-center gap-3">
          <div
            className="h-6 w-1 rounded-full"
            style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.15))' }}
          />
          <h2 className="text-lg font-bold text-[#d4af37]">全作品ピックアップ</h2>
          <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#d4af37]">
            {articles.length}件
          </span>
        </div>

        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-white/30 space-y-3">
            <p className="text-4xl">🎬</p>
            <p className="text-sm">作品データを取得中です</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {articles.map((article, i) => (
              <WorkCard
                key={article.id}
                article={article}
                rank={i + 1}
                fanzaUrl={getAffiliateUrl(article, isOverseas)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── フッター ── */}
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-4 text-center">
        <div
          className="h-px"
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(212,175,55,0.3), transparent)',
          }}
        />
        <p
          className="text-[12px] text-[#d4af37]/50 leading-relaxed"
          style={{ textShadow: '0 0 16px rgba(212,175,55,0.3)' }}
        >
          引退まで全力で応援しています。ありがとうMINAMO。
        </p>
        <p className="text-[10px] text-white/25">
          <span className="mr-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold border border-[#d4af37]/25 bg-[#d4af37]/8 text-[#d4af37]/50">
            PR
          </span>
          FANZAへのリンクはアフィリエイトリンクです
        </p>
        <Link
          href="/verity"
          className="inline-block text-sm text-white/30 hover:text-[#d4af37]/60 transition-colors"
        >
          ← トップへ戻る
        </Link>
      </div>
    </div>
  )
}
