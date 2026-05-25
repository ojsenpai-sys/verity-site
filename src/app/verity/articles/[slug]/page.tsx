export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, ExternalLink, Play, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AffiliateLinkBlock } from '@/components/AffiliateLink'
import { withAffiliate } from '@/lib/affiliate'
import type { Article, AffiliateLink } from '@/lib/types'

function proxyUrl(url: string) {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

type Params = { slug: string }

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('title, summary, image_url, metadata, tags')
    .eq('slug', slug)
    .single()

  if (!data) return {}

  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

  // 女優名を metadata.actress から取得し description に含める
  const actresses: { name: string }[] = Array.isArray(data.metadata?.actress)
    ? (data.metadata.actress as { name: string }[])
    : []
  const actressNames = actresses.map(a => a.name).join('・')
  const descPrefix   = actressNames ? `${actressNames}出演。` : ''
  const description  = `${descPrefix}${data.summary ?? data.title}`

  const ogImage = data.image_url
    ? [{ url: data.image_url, width: 800, height: 538, alt: data.title }]
    : undefined

  return {
    title:       data.title,
    description,
    alternates:  { canonical: `${BASE}/articles/${slug}` },
    openGraph: {
      type:        'article',
      title:       data.title,
      description,
      images:      ogImage,
    },
    twitter: {
      title:       data.title,
      description,
      images:      data.image_url ? [data.image_url] : undefined,
    },
  }
}

type DmmInfoEntry = { id: number; name: string; ruby?: string }

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
      <dt className="w-20 shrink-0 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="flex flex-wrap gap-1.5">{children}</dd>
    </div>
  )
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!article) notFound()

  const { data: affiliateLinks } = await supabase
    .from('affiliate_links')
    .select('*')
    .eq('article_id', article.id)
    .order('display_order')

  const a = article as Article
  const links = (affiliateLinks as AffiliateLink[]) ?? []

  const isUpcoming = a.published_at ? new Date(a.published_at).getTime() > Date.now() : false
  // storedFanzaUrl または生 DMM URL を withAffiliate() 経由で統一
  const rawFanzaUrl =
    (typeof a.metadata?.affiliate_url === 'string' ? a.metadata.affiliate_url : null) ??
    (a.source === 'dmm' && typeof a.metadata?.url === 'string' ? (a.metadata.url as string) : null)
  const fanzaUrl = withAffiliate(rawFanzaUrl)
  const sampleMovieUrl = typeof a.metadata?.sample_movie_url === 'string' ? a.metadata.sample_movie_url : null

  // ── 媒体種別の判定 ──────────────────────────────────────────────────────────
  const currentFloor  = typeof a.metadata?.floor === 'string' ? a.metadata.floor : null
  const productNumber = typeof a.metadata?.number === 'string' ? a.metadata.number : null
  // metadata.url は DMM API の生 URL（エンコードなし）→ DVD・同人判定の一番信頼できる情報源
  // affiliate_url は al.fanza.co.jp/?lurl=エンコード形式の場合があり /mono/dvd/ が見えない
  const metaDirectUrl   = typeof a.metadata?.url === 'string' ? (a.metadata.url as string) : null
  const isDoujinArticle = metaDirectUrl !== null && metaDirectUrl.includes('/dc/doujin/')
  const isDvdArticle    =
    !isDoujinArticle && (
      currentFloor === 'dvd' ||
      (metaDirectUrl !== null && metaDirectUrl.includes('/mono/dvd/')) ||
      (rawFanzaUrl !== null && (rawFanzaUrl.includes('/mono/dvd/') || rawFanzaUrl.includes('%2Fmono%2Fdvd%2F')))
    )
  const isDigitalPrimary = !isDvdArticle && !isDoujinArticle

  // DB 上のカウンターパート（同一タイトルの異媒体版）を検索
  // floor=null でも isDvdArticle で DVD 判定できる場合はカウンターパートを検索する
  const effectiveFloor = isDvdArticle ? 'dvd' : (currentFloor ?? null)
  let counterpartUrl: string | null = null
  if (productNumber && effectiveFloor) {
    const counterFloor = effectiveFloor === 'videoa' ? 'dvd' : 'videoa'
    const { data: cpData } = await supabase
      .from('articles')
      .select('metadata')
      .filter('metadata->>number', 'eq', productNumber)
      .filter('metadata->>floor', 'eq', counterFloor)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (cpData) {
      const cpMeta = cpData.metadata as Record<string, unknown> | null
      const rawCpUrl =
        (typeof cpMeta?.affiliate_url === 'string' ? cpMeta.affiliate_url : null) ??
        (typeof cpMeta?.url === 'string' ? (cpMeta.url as string) : null)
      const cpUrl = withAffiliate(rawCpUrl)
      // カウンターパートが実際に期待する媒体のURLかを検証（データ不整合ガード）
      // metadata.url（生 DMM URL）で確認するのが最も確実
      const cpDirectUrl = typeof cpMeta?.url === 'string' ? (cpMeta.url as string) : null
      const cpIsDvd = (cpDirectUrl !== null && cpDirectUrl.includes('/mono/dvd/'))
      if (counterFloor === 'videoa' && cpUrl && !cpIsDvd) {
        counterpartUrl = cpUrl
      } else if (counterFloor === 'dvd' && cpUrl) {
        counterpartUrl = cpUrl
      }
    }
  }

  const digitalUrl = isDigitalPrimary ? fanzaUrl : counterpartUrl
  const dvdUrl     = isDigitalPrimary ? counterpartUrl : fanzaUrl
  const hasBothVersions = !!(digitalUrl && dvdUrl)

  const actresses = Array.isArray(a.metadata?.actress)
    ? (a.metadata!.actress as DmmInfoEntry[])
    : []
  const makers = Array.isArray(a.metadata?.maker)
    ? (a.metadata!.maker as DmmInfoEntry[])
    : []
  const labels = Array.isArray(a.metadata?.label)
    ? (a.metadata!.label as DmmInfoEntry[])
    : []
  const series = Array.isArray(a.metadata?.series)
    ? (a.metadata!.series as DmmInfoEntry[])
    : []
  const directors = Array.isArray(a.metadata?.director)
    ? (a.metadata!.director as DmmInfoEntry[])
    : []
  const review = a.metadata?.review as { count: number; average: string } | null | undefined
  const price = typeof a.metadata?.price === 'string' ? a.metadata.price : null

  const actressNameSet = new Set(actresses.map((ac) => ac.name))
  const genreTags = (a.tags ?? []).filter((t) => !actressNameSet.has(t))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      {/* Back */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
      >
        <ArrowLeft size={15} />
        ダッシュボードへ戻る
      </Link>

      {/* Category + source */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {a.category && (
          <span className="rounded-full bg-[var(--magenta)]/15 px-3 py-1 font-medium text-[var(--magenta)]">
            {a.category}
          </span>
        )}
        <span className="text-[var(--text-muted)]">{a.source}</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold leading-snug tracking-tight text-[var(--text)] sm:text-3xl">
        {a.title}
      </h1>

      {/* Full-package image — natural aspect ratio, no cropping */}
      {(() => {
        // 同人コミックで image_url 未設定の場合、metadata.url から cid を抽出して FANZA 書影 URL を生成
        const displayImageUrl = a.image_url ?? (
          isDoujinArticle && metaDirectUrl
            ? (() => {
                const m = metaDirectUrl.match(/\/cid=([^/?]+)/)
                return m ? `https://pics.dmm.co.jp/digital/comic/${m[1]}/${m[1]}pl.jpg` : null
              })()
            : null
        )
        if (!displayImageUrl) return null
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxyUrl(displayImageUrl)}
            alt={a.title}
            className="w-full h-auto rounded-xl bg-[var(--surface-2)]"
          />
        )
      })()}

      {/* CTAs */}
      {(fanzaUrl || sampleMovieUrl) && (
        <div className="flex flex-col items-center gap-4">

          {/* 同人コミック専用CTA — グリーングラデーション */}
          {isDoujinArticle && fanzaUrl ? (
            <>
              <a
                href={fanzaUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex w-full max-w-sm items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_32px_rgba(16,185,129,0.45)] hover:shadow-[0_0_48px_rgba(16,185,129,0.65)] hover:brightness-110 active:scale-95 transition-all"
              >
                DMM同人で作品を見る
                <ExternalLink size={14} className="shrink-0" />
              </a>
              <p className="text-[10px] text-[var(--text-muted)]">
                <span className="rounded px-1.5 py-0.5 font-bold tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">PR</span>
                {' '}上記リンクはアフィリエイトリンクです
              </p>
            </>
          ) : hasBothVersions ? (
            /* ダブル導線: 動画ファースト階層 */
            <>
              {/* ── Primary Hero: 動画配信 ── */}
              <a
                href={digitalUrl!}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex w-full max-w-sm items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_32px_rgba(14,165,233,0.45)] hover:shadow-[0_0_48px_rgba(14,165,233,0.65)] hover:brightness-110 active:scale-95 transition-all"
              >
                <Play size={16} className="fill-white shrink-0" />
                {isUpcoming ? '動画版を予約する（最高画質）' : '動画で今すぐ見る（最高画質）'}
                <ExternalLink size={14} className="shrink-0" />
              </a>

              {/* ── Secondary: DVD ── */}
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-[11px] text-[var(--text-muted)]">
                  パッケージ版（現物）をお求めの方はこちら
                </p>
                <a
                  href={dvdUrl!}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex items-center gap-2 rounded-full border border-orange-500/60 px-6 py-2.5 text-sm font-semibold text-orange-400 hover:bg-orange-500/10 hover:border-orange-400 active:scale-95 transition-all"
                >
                  {isUpcoming ? 'DVD・Blu-rayを予約する' : 'DVD・Blu-rayを購入する'}
                  <ExternalLink size={13} className="shrink-0" />
                </a>
              </div>
            </>
          ) : (
            /* シングル導線 */
            fanzaUrl && (
              !isDigitalPrimary ? (
                /* DVD・Blu-ray のみ存在 */
                <a
                  href={fanzaUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full bg-orange-500 px-8 py-4 text-base font-bold text-white shadow-[0_0_24px_rgba(249,115,22,0.35)] hover:shadow-[0_0_36px_rgba(249,115,22,0.6)] hover:brightness-110 active:scale-95 transition-all"
                >
                  {isUpcoming ? 'DVD・Blu-rayを予約する' : 'DVD・Blu-rayを購入する'}
                  <ExternalLink size={15} />
                </a>
              ) : (
                /* 動画配信のみ存在（デフォルト） */
                <a
                  href={fanzaUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex w-full max-w-sm items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_32px_rgba(14,165,233,0.45)] hover:shadow-[0_0_48px_rgba(14,165,233,0.65)] hover:brightness-110 active:scale-95 transition-all"
                >
                  <Play size={16} className="fill-white shrink-0" />
                  {isUpcoming ? '動画版を予約する（最高画質）' : '動画で今すぐ見る（最高画質）'}
                  <ExternalLink size={14} />
                </a>
              )
            )
          )}

          {/* サンプル動画 */}
          {sampleMovieUrl && (
            <a
              href={sampleMovieUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--magenta)] px-6 py-2.5 text-sm font-bold text-[var(--magenta)] hover:bg-[var(--magenta)]/10 active:scale-95 transition-all"
            >
              <Play size={14} className="fill-[var(--magenta)]" />
              サンプル動画を見る
            </a>
          )}

          {/* PR 表記（同人コミックは専用CTAブロック内に含むため除外） */}
          {!isDoujinArticle && (
            <p className="text-[10px] text-[var(--text-muted)]">
              <span className="rounded px-1.5 py-0.5 font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">PR</span>
              {' '}上記リンクはアフィリエイトリンクです
            </p>
          )}
        </div>
      )}

      {/* Metadata card */}
      <dl className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        {actresses.length > 0 && (
          <MetaRow label="女優">
            {actresses.map((act) => (
              <Link
                key={act.id}
                href={act.id > 0 ? `/actresses/dmm-actress-${act.id}` : `/?tag=${encodeURIComponent(act.name)}`}
                className="inline-flex items-center rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-2.5 py-0.5 text-[13px] font-semibold text-[var(--magenta)] hover:bg-[var(--magenta)]/25 transition-colors"
              >
                {act.name}
              </Link>
            ))}
          </MetaRow>
        )}

        {a.published_at && (
          <MetaRow label="発売日">
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]">
              <Calendar size={13} className="text-[var(--text-muted)]" />
              {new Date(a.published_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {isUpcoming && (
                <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                  予約受付中
                </span>
              )}
            </span>
          </MetaRow>
        )}

        {makers.length > 0 && (
          <MetaRow label="メーカー">
            {makers.map((m) => (
              <span key={m.id} className="text-sm text-[var(--text)]">{m.name}</span>
            ))}
          </MetaRow>
        )}

        {labels.length > 0 && (
          <MetaRow label="レーベル">
            {labels.map((l) => (
              <span key={l.id} className="text-sm text-[var(--text)]">{l.name}</span>
            ))}
          </MetaRow>
        )}

        {series.length > 0 && (
          <MetaRow label="シリーズ">
            {series.map((s) => (
              <span key={s.id} className="text-sm text-[var(--text)]">{s.name}</span>
            ))}
          </MetaRow>
        )}

        {directors.length > 0 && (
          <MetaRow label="監督">
            {directors.map((d) => (
              <span key={d.id} className="text-sm text-[var(--text)]">{d.name}</span>
            ))}
          </MetaRow>
        )}

        {genreTags.length > 0 && (
          <MetaRow label="ジャンル">
            {genreTags.map((tag) => (
              <Link
                key={tag}
                href={`/?tag=${encodeURIComponent(tag)}`}
                className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </MetaRow>
        )}

        {(review || price) && (
          <div className="flex flex-wrap items-center gap-6 border-t border-[var(--border)] pt-4">
            {review && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                <span className="font-semibold text-[var(--text)]">{review.average}</span>
                <span className="text-[var(--text-muted)]">({review.count.toLocaleString()}件)</span>
              </span>
            )}
            {price && (
              <span className="text-sm">
                <span className="font-bold text-[var(--text)]">¥{price}</span>
              </span>
            )}
          </div>
        )}
      </dl>

      {/* Summary */}
      {a.summary && (
        <p className="rounded-xl border-l-4 border-[var(--magenta)] bg-[var(--surface)] px-5 py-4 text-sm leading-relaxed text-[var(--text-muted)] italic">
          {a.summary}
        </p>
      )}

      {/* Body */}
      {a.content && (
        <div className="prose prose-invert prose-sm max-w-none text-[var(--text)] leading-relaxed space-y-4">
          {a.content.split('\n').map((line, i) =>
            line.trim() ? <p key={i}>{line}</p> : <br key={i} />
          )}
        </div>
      )}

      {/* Affiliate links from DB */}
      <AffiliateLinkBlock links={links} />

      {/* Raw metadata (dev only) */}
      {process.env.NODE_ENV === 'development' && a.metadata && (
        <details className="rounded-lg border border-[var(--border)] text-xs">
          <summary className="cursor-pointer px-4 py-2 text-[var(--text-muted)]">
            Raw metadata (dev only)
          </summary>
          <pre className="overflow-auto p-4 text-[var(--text-muted)]">
            {JSON.stringify(a.metadata, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
