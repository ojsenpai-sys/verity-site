import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { FanzaLink } from './FanzaLink'
import { HeroCountdown, HeroDayProgress } from './HeroCountdown'
import { coverPosClass } from '@/lib/cidUtils'
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

  // ── 色アクセント（Hero=マゼンタ / Flash=アンバー） ───────────────────────────
  const accentText   = isFlash ? 'text-amber-300' : 'text-[var(--magenta)]'
  const tagHover     = isFlash ? 'hover:border-amber-400/40' : 'hover:border-[var(--magenta)]/40'

  return (
    <section
      id="hero"
      className={[
        'group relative overflow-hidden rounded-2xl border bg-[var(--surface)]',
        isFlash ? 'border-amber-500/25' : 'border-[var(--border)]',
      ].join(' ')}
    >
      {/* Top accent line — amber for flash, magenta for hero */}
      <div className={[
        'pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r',
        isFlash
          ? 'from-amber-400/80 via-orange-500/40 to-transparent'
          : 'from-[var(--magenta)]/70 via-amber-400/30 to-transparent',
      ].join(' ')} />

      {/* Faint blurred cover for cinematic immersion */}
      {proxyImg && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxyImg}
            alt=""
            className="h-full w-full scale-150 object-cover object-center blur-3xl opacity-[0.08]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--surface)] via-[var(--surface)]/92 to-[var(--surface)]/55" />
        </div>
      )}

      {/* Atmospheric drifting glow blob — variant-tinted */}
      <div
        aria-hidden="true"
        className={[
          'drift pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl',
          isFlash ? 'bg-amber-500/15' : 'bg-[var(--magenta)]/20',
        ].join(' ')}
      />

      {/* Flash: day-progress urgency bar (resets at midnight JST) */}
      {isFlash && <HeroDayProgress />}

      <div className="relative flex flex-col items-center gap-5 p-5 text-center sm:flex-row sm:items-center sm:gap-9 sm:p-8 sm:text-left">

        {/* Cover image */}
        {proxyImg && (
          <FanzaLink
            href={affiliateUrl}
            targetId={article.external_id}
            position="hero_image"
            className="relative block shrink-0"
          >
            {isFlash && (
              <div className="pointer-events-none absolute -inset-1.5 rounded-2xl bg-amber-500/20 blur-md" aria-hidden="true" />
            )}
            <div className={[
              'relative aspect-[2/3] w-[150px] overflow-hidden rounded-xl shadow-[0_18px_56px_rgba(0,0,0,0.70)] transition-transform duration-300 group-hover:scale-[1.03] sm:w-[200px] lg:w-[208px]',
              isFlash ? 'border border-amber-400/30' : '',
            ].join(' ')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proxyImg}
                alt={article.title}
                className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(article.image_url)}`}
              />
            </div>
          </FanzaLink>
        )}

        {/* Content */}
        <div className="flex min-w-0 flex-col items-center gap-3.5 sm:items-start">

          {/* Badge row */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            {isFlash ? (
              <>
                <span className="flash-pulse inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                  ⚡ Today&apos;s Flash
                </span>
                {/* Client-side HH:MM:SS countdown to midnight JST */}
                <HeroCountdown />
              </>
            ) : (
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--magenta)]/30 bg-[var(--magenta)]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--magenta)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)] shadow-[0_0_8px_var(--magenta)]" />
                Today&apos;s Hero
              </span>
            )}
          </div>

          {/* Title */}
          <h2 className="line-clamp-2 max-w-[44ch] text-lg font-bold leading-snug tracking-tight text-[var(--text)] sm:text-[26px]">
            {article.title}
          </h2>

          {/* Actress names */}
          {actresses.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 sm:justify-start">
              {actresses.slice(0, 3).map((a, i) => (
                <span key={a.id || a.name} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-[var(--text-muted)]">/</span>}
                  <Link
                    href={a.id > 0 ? `/verity/actresses/dmm-actress-${a.id}` : '#'}
                    className={`text-[15px] font-bold transition-colors hover:underline ${accentText}`}
                  >
                    {a.name}
                  </Link>
                </span>
              ))}
            </div>
          )}

          {/* Genre tags */}
          {genreTags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              {genreTags.map(tag => (
                <Link
                  key={tag}
                  href={`/verity/genres/${encodeURIComponent(tag)}`}
                  className={`rounded-full border border-[var(--border)] px-3 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)] ${tagHover}`}
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {/* CTA row */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            {/* Primary CTA */}
            <FanzaLink
              href={affiliateUrl}
              targetId={article.external_id}
              position="hero_cta"
              className={[
                'inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.97]',
                isFlash
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-[#1a1207] shadow-[0_0_24px_rgba(245,158,11,0.45)] hover:shadow-[0_0_40px_rgba(245,158,11,0.65)]'
                  : 'bg-gradient-to-r from-[var(--magenta)] to-rose-600 text-white shadow-[0_0_24px_rgba(226,0,116,0.42)] hover:shadow-[0_0_40px_rgba(226,0,116,0.65)]',
              ].join(' ')}
            >
              ▶ FANZAで今すぐ観る
              <span className="opacity-70">↗</span>
            </FanzaLink>

            {/* Premium secondary CTAs — VR / DVD */}
            {isVrHero && (
              <FanzaLink
                href={affiliateUrl}
                targetId={article.external_id}
                position="card_premium_vr"
                className="rounded-full border border-violet-400/40 px-4 py-3 text-[12px] font-semibold text-violet-300 transition-all hover:bg-violet-400/10 active:scale-[0.97]"
              >
                🥽 VR
              </FanzaLink>
            )}
            {isDvdHero && (
              <FanzaLink
                href={affiliateUrl}
                targetId={article.external_id}
                position="card_premium_dvd"
                className="rounded-full border border-blue-400/40 px-4 py-3 text-[12px] font-semibold text-blue-300 transition-all hover:bg-blue-400/10 active:scale-[0.97]"
              >
                📀 DVD
              </FanzaLink>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
