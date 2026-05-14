export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, ExternalLink, Tag, UserCircle } from 'lucide-react'
import { fetchNewsBySlug } from '@/app/verity/actions/news'
import { MarkdownBody } from '@/components/MarkdownBody'
import { PhotoGallery } from '@/components/PhotoGallery'
import { LpSupportButton } from '@/components/LpSupportButton'
import { PurchaseLink } from '@/components/PurchaseLink'
import { LogView } from '@/components/LogView'
import { ShareButton } from '@/components/ShareButton'
import { withAffiliate } from '@/lib/affiliate'

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const news = await fetchNewsBySlug(slug)
  if (!news) return {}
  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
  const description = news.summary ?? undefined

  // pl.jpg は 800×538 (3:2 横長)。プロキシ経由にすることで:
  //  1. DMM ホットリンク制限をバイパスしてクローラーが取得できる
  //  2. プロキシが jp.jpg（最高解像度）を先に試みる
  const ogImageUrl = news.thumbnail_url
    ? `${BASE}/verity/api/proxy/image?url=${encodeURIComponent(news.thumbnail_url)}`
    : undefined
  const ogImage = ogImageUrl
    ? [{ url: ogImageUrl, width: 800, height: 538, alt: news.title }]
    : undefined

  return {
    title:       news.title,
    description,
    alternates:  { canonical: `${BASE}/news/${slug}` },
    openGraph: {
      type:        'article',
      title:       news.title,
      description,
      images:      ogImage,
    },
    twitter: {
      title:       news.title,
      description,
      images:      ogImageUrl ? [ogImageUrl] : undefined,
    },
  }
}

function proxyUrl(url: string) {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default async function NewsDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const news = await fetchNewsBySlug(slug)
  if (!news) notFound()

  const fanzaHref = withAffiliate(news.fanza_link)
  const actress   = news.actress

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">

      {/* 記事閲覧ログ（二つ名・dawn_scout / data_diver / clairvoyant / swift_reader 判定） */}
      <LogView targetType="article" targetId={news.slug} actionType="view" />

      {/* ナビゲーション */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
        <Link href="/verity/news" className="inline-flex items-center gap-1.5 hover:text-[var(--magenta)] transition-colors">
          <ArrowLeft size={14} />
          ニュース一覧
        </Link>
        {actress && (
          <>
            <span className="text-[var(--border)]" aria-hidden>|</span>
            <Link
              href={`/verity/actresses/${actress.external_id}`}
              className="inline-flex items-center gap-1.5 hover:text-[var(--magenta)] transition-colors"
            >
              <UserCircle size={14} />
              {actress.name}
            </Link>
          </>
        )}
      </div>

      {/* カテゴリ + 公開日 */}
      <div className="flex flex-wrap items-center gap-2.5">
        {news.category && (
          <span className="rounded-full bg-[var(--magenta)] px-3 py-1 text-xs font-bold tracking-wider text-white shadow-[0_0_10px_rgba(226,0,116,0.4)]">
            {news.category}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Calendar size={11} />
          {formatDate(news.published_at)}
        </span>
      </div>

      {/* タイトル */}
      <h1 className="text-2xl font-bold leading-snug tracking-tight text-[var(--text)] sm:text-3xl">
        {news.title}
      </h1>

      {/* リード文 */}
      {news.summary && (
        <p className="rounded-xl border-l-4 border-[var(--magenta)] bg-[var(--surface)] px-5 py-4 text-sm leading-relaxed italic text-[var(--text-muted)]">
          {news.summary}
        </p>
      )}

      {/* サムネイル — pl.jpg は横長(800×538 ≈ 3:2)。aspect-[3/2] でCLS防止。 */}
      {news.thumbnail_url && (
        <div className="relative w-full aspect-[3/2] overflow-hidden rounded-xl bg-[var(--surface-2)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyUrl(news.thumbnail_url)}
            alt={news.title}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        </div>
      )}

      {/* 女優プロフィールリンク */}
      {actress && (
        <Link
          href={`/verity/actresses/${actress.external_id}`}
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--magenta)]/60 hover:shadow-[0_0_20px_rgba(226,0,116,0.1)] transition-all"
        >
          <div>
            <p className="font-bold text-[var(--text)]">{actress.name}</p>
            {actress.ruby && <p className="text-xs text-[var(--text-muted)]">{actress.ruby}</p>}
            <p className="mt-0.5 text-xs text-[var(--magenta)]">プロフィール・作品一覧 →</p>
          </div>
        </Link>
      )}

      {/* 本文 */}
      <MarkdownBody content={news.content} />

      {/* フォトギャラリー */}
      {news.gallery_urls.length > 0 && (
        <PhotoGallery urls={news.gallery_urls} title="フォトギャラリー" />
      )}

      {/* タグ */}
      {news.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {news.tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)]"
            >
              <Tag size={10} />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ─── アクションエリア ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--magenta)]/20 bg-[var(--surface)] p-6 space-y-4 shadow-[0_0_40px_rgba(226,0,116,0.08)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
          <span className="h-2 w-2 rounded-full bg-[var(--magenta)] shadow-[0_0_6px_rgba(226,0,116,0.8)]" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Action
          </h2>
          <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
            PR
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* FANZA 購入・予約 */}
          {fanzaHref && actress && (
            <PurchaseLink
              href={fanzaHref}
              targetId={actress.external_id}
              actionType="purchase_click"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--magenta)] px-8 py-3.5 text-base font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.4)] hover:shadow-[0_0_40px_rgba(226,0,116,0.65)] hover:brightness-110 active:scale-95 transition-all"
            >
              FANZAで購入・予約する
              <ExternalLink size={15} />
            </PurchaseLink>
          )}

          {/* LP 応援ボタン */}
          {actress && (
            <LpSupportButton actressId={actress.id} actressName={actress.name} />
          )}
        </div>

        {fanzaHref && (
          <p className="text-[11px] text-[var(--text-muted)]">
            ※ リンクはアフィリエイトリンクです
          </p>
        )}
      </div>

      {/* シェア + 戻るリンク */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href="/verity/news"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          <ArrowLeft size={14} />
          ニュース一覧へ戻る
        </Link>
        <ShareButton url={`/verity/news/${news.slug}`} title={news.title} />
      </div>
    </div>
  )
}
