import Link from 'next/link'
import { ExternalLink, Flame, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { FanzaLink } from './FanzaLink'
import { HeroCountdown } from './HeroCountdown'
import type { Article } from '@/lib/types'

type HeroResult = { article: Article; isFlash: boolean }

async function getHeroArticle(): Promise<HeroResult | null> {
  const supabase   = await createClient()
  const todayJst   = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })
  const nowIso     = new Date().toISOString()

  // ── 1st pass: cron が設定したフラグ付き作品を最優先 ────────────────────────
  const { data: flagged } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .filter('metadata->>todays_pick_date', 'eq', todayJst)
    .not('image_url', 'is', null)
    .limit(1)
    .maybeSingle()

  if (flagged) return { article: flagged as Article, isFlash: false }

  // ── 2nd pass: 直近24h の fanza_click 最多作品（デイリーフラッシュ） ─────────
  const h24Ago = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: clickRows } = await supabase
    .from('user_events')
    .select('target_id')
    .eq('event_name', 'fanza_click')
    .gte('created_at', h24Ago)
    .limit(500)

  if (clickRows && clickRows.length > 0) {
    const clickMap = new Map<string, number>()
    for (const row of clickRows as { target_id: string | null }[]) {
      if (row.target_id) clickMap.set(row.target_id, (clickMap.get(row.target_id) ?? 0) + 1)
    }
    const topId = [...clickMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

    if (topId) {
      const { data: flashArt } = await supabase
        .from('articles')
        .select('*')
        .eq('external_id', topId)
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .lte('published_at', nowIso)
        .maybeSingle()

      if (flashArt) {
        const url = ((flashArt as Article).metadata as Record<string, unknown>)?.url as string | undefined
        if (!url?.includes('/dc/doujin/')) {
          return { article: flashArt as Article, isFlash: true }
        }
      }
    }
  }

  // ── 3rd pass: オンデマンドスコアリング（フォールバック） ─────────────────────
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gte('published_at', cutoff)
    .lte('published_at', nowIso)
    .not('image_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(50)

  const candidates = ((data as Article[]) ?? []).filter(a => {
    const url = (a.metadata as Record<string, unknown>)?.url as string | undefined
    return !url?.includes('/dc/doujin/')
  })
  if (!candidates.length) return null

  const now = Date.now()
  const best =
    candidates
      .map(a => {
        const pubMs      = a.published_at ? new Date(a.published_at).getTime() : 0
        const ageDays    = (now - pubMs) / (1000 * 60 * 60 * 24)
        const freshScore = Math.max(0, 1 - ageDays / 7)
        const actressList = (a.metadata as Record<string, unknown>)?.actress
        const soloBonus   = Array.isArray(actressList)
          ? (actressList.length === 1 ? 2.0 : actressList.length === 2 ? 1.5 : 1.0)
          : 1.0
        return { article: a, score: freshScore * soloBonus }
      })
      .sort((x, y) => y.score - x.score)[0]?.article ?? null

  return best ? { article: best, isFlash: false } : null
}

export async function HeroSection() {
  const [heroResult, isOverseas] = await Promise.all([
    getHeroArticle(),
    getIsOverseasUser(),
  ])
  if (!heroResult) return null

  const { article, isFlash } = heroResult
  const meta         = (article.metadata ?? {}) as Record<string, unknown>
  const rawUrl       = (meta.affiliate_url ?? meta.url) as string | null
  const affiliateUrl = withAffiliateForRegion(rawUrl, isOverseas)
  if (!affiliateUrl) return null

  const actresses: Array<{ id: number; name: string }> = Array.isArray(meta.actress)
    ? (meta.actress as Array<{ id: number; name: string }>)
    : []
  const actressNameSet = new Set(actresses.map(a => a.name))
  const genreTags = (article.tags ?? [])
    .filter(t => !actressNameSet.has(t))
    .slice(0, 4)

  const isVrHero  = (article.tags ?? []).some((t: string) => /^VR/.test(t))
  const isDvdHero = typeof meta.url === 'string' && (meta.url as string).includes('/mono/dvd/')

  const proxyImg = article.image_url
    ? `/api/proxy/image?url=${encodeURIComponent(article.image_url)}`
    : null

  return (
    <section
      id="hero"
      className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
    >
      {/* Atmospheric background blur */}
      {proxyImg && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyImg}
            alt=""
            className="h-full w-full scale-150 object-cover object-center blur-3xl opacity-[0.10]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--surface)] via-[var(--surface)]/90 to-[var(--surface)]/50" />
        </div>
      )}

      {/* Top accent line — amber for flash, magenta for hero */}
      <div className={[
        'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r',
        isFlash
          ? 'from-amber-400/80 via-orange-400/50 to-transparent'
          : 'from-[var(--magenta)]/60 via-amber-400/40 to-transparent',
      ].join(' ')} />

      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:gap-8 sm:px-7 sm:py-7 lg:px-9 lg:py-8">

        {/* Cover image */}
        {proxyImg && (
          <FanzaLink
            href={affiliateUrl}
            targetId={article.external_id}
            position="hero_image"
            className="group/hero-img mx-auto w-full max-w-[150px] shrink-0 sm:mx-0 sm:max-w-[180px] lg:max-w-[200px]"
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-[0_12px_48px_rgba(0,0,0,0.70)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyImg}
                alt={article.title}
                className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover/hero-img:scale-105"
              />
              {/* Desktop-only hover overlay */}
              <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover/hero-img:bg-black/55 md:flex">
                <span className="translate-y-1 scale-95 rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-bold text-gray-900 opacity-0 shadow-lg transition-all duration-200 group-hover/hero-img:translate-y-0 group-hover/hero-img:scale-100 group-hover/hero-img:opacity-100">
                  ▶ 観る
                </span>
              </div>
            </div>
          </FanzaLink>
        )}

        {/* Content */}
        <div className="flex min-w-0 flex-col gap-3.5">

          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-2">
            {isFlash ? (
              <>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] uppercase text-amber-300">
                  <Zap size={10} />
                  Today&apos;s Flash
                </span>
                {/* Client-side countdown to midnight JST */}
                <HeroCountdown />
              </>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--magenta)]/30 bg-[var(--magenta)]/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] uppercase text-[var(--magenta)]">
                <Flame size={10} />
                Today&apos;s Hero
              </span>
            )}
          </div>

          {/* Actress names */}
          {actresses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actresses.slice(0, 3).map(a => (
                <Link
                  key={a.id || a.name}
                  href={a.id > 0 ? `/verity/actresses/dmm-actress-${a.id}` : '#'}
                  className="text-sm font-bold text-[var(--magenta)] transition-colors hover:underline"
                >
                  {a.name}
                </Link>
              ))}
            </div>
          )}

          {/* Title */}
          <h2 className="line-clamp-3 text-base font-bold leading-relaxed text-[var(--text)] sm:text-[17px]">
            {article.title}
          </h2>

          {/* Genre tags */}
          {genreTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genreTags.map(tag => (
                <Link
                  key={tag}
                  href={`/verity/genres/${encodeURIComponent(tag)}`}
                  className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors hover:border-[var(--magenta)]/50 hover:text-[var(--magenta)]"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {/* Primary CTA */}
          <FanzaLink
            href={affiliateUrl}
            targetId={article.external_id}
            position="hero_cta"
            className={[
              'mt-1 inline-flex w-fit items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all duration-200 active:scale-[0.97]',
              isFlash
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_24px_rgba(245,158,11,0.40)] hover:brightness-110 hover:shadow-[0_0_40px_rgba(245,158,11,0.65)]'
                : 'bg-gradient-to-r from-[var(--magenta)] to-rose-600 shadow-[0_0_24px_rgba(226,0,116,0.40)] hover:brightness-110 hover:shadow-[0_0_40px_rgba(226,0,116,0.65)]',
            ].join(' ')}
          >
            ▶ FANZAで今すぐ観る
            <ExternalLink size={13} />
          </FanzaLink>

          {/* Premium secondary CTAs — VR / DVD */}
          {(isVrHero || isDvdHero) && (
            <div className="flex flex-wrap gap-2">
              {isVrHero && (
                <FanzaLink
                  href={affiliateUrl}
                  targetId={article.external_id}
                  position="card_premium_vr"
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 px-5 py-2 text-sm font-bold text-violet-300 transition-all hover:bg-violet-500/25 active:scale-[0.97]"
                >
                  🥽 VRで体感する
                  <ExternalLink size={12} />
                </FanzaLink>
              )}
              {isDvdHero && (
                <FanzaLink
                  href={affiliateUrl}
                  targetId={article.external_id}
                  position="card_premium_dvd"
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-400/40 bg-blue-500/15 px-5 py-2 text-sm font-bold text-blue-300 transition-all hover:bg-blue-500/25 active:scale-[0.97]"
                >
                  📀 特典付きDVD版をGET
                  <ExternalLink size={12} />
                </FanzaLink>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
