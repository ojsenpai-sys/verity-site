import Link from 'next/link'
import { ExternalLink, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Article } from '@/lib/types'

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getTodaysPick(): Promise<Article | null> {
  const supabase = await createClient()
  const todayJst = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })

  // 1st pass: フラグ付き作品を優先（syncTodaysPick() が0:00に設定）
  const { data: flagged } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .filter('metadata->>todays_pick_date', 'eq', todayJst)
    .not('image_url', 'is', null)
    .limit(1)
    .maybeSingle()

  if (flagged) return flagged as Article

  // 2nd pass: フォールバック — オンデマンドスコアリング（0:00 cron が未実行の場合）
  // lte(now) で未来日付の予約作品を除外（freshScore > 1 になり常に当選するバグを防ぐ）
  const nowIso  = new Date().toISOString()
  const cutoff  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gte('published_at', cutoff)
    .lte('published_at', nowIso)
    .not('image_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(100)

  const candidates = ((data as Article[]) ?? []).filter(a => {
    const url = (a.metadata as Record<string, unknown>)?.url as string | undefined
    return !url?.includes('/dc/doujin/')
  })

  if (!candidates.length) return null

  const now = Date.now()
  const scored = candidates.map(a => {
    const pubMs = a.published_at ? new Date(a.published_at).getTime() : 0
    const ageDays = (now - pubMs) / (1000 * 60 * 60 * 24)
    const freshScore = Math.max(0, 1 - ageDays / 7)
    const actressList = (a.metadata as Record<string, unknown>)?.actress
    const actressCount = Array.isArray(actressList) ? actressList.length : 0
    const soloBonus = actressCount === 1 ? 2.0 : actressCount === 2 ? 1.5 : 1.0
    return { article: a, score: freshScore * soloBonus }
  }).sort((a, b) => b.score - a.score)

  return scored[0]?.article ?? null
}

// ─── Component ────────────────────────────────────────────────────────────────

export async function TodaysPickSection() {
  const article = await getTodaysPick()
  if (!article) return null

  const meta = (article.metadata ?? {}) as Record<string, unknown>
  const affiliateUrl = meta.affiliate_url as string | null
  const articleUrl   = meta.url as string | null
  const href = affiliateUrl ?? articleUrl ?? `/verity/articles/${article.slug}`

  const actresses: Array<{ id: number; name: string }> =
    Array.isArray(meta.actress) ? (meta.actress as Array<{ id: number; name: string }>) : []
  const actressNameSet = new Set(actresses.map(a => a.name))
  const genreTags = (article.tags ?? [])
    .filter(t => !actressNameSet.has(t))
    .slice(0, 5)

  const pickDate = new Date().toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month:    'long',
    day:      'numeric',
    weekday:  'short',
  })

  return (
    <section
      id="todays-pick"
      className="relative overflow-hidden rounded-2xl border border-amber-400/25 bg-white/[0.025] backdrop-blur-sm shadow-[0_0_48px_rgba(251,191,36,0.10)]"
    >
      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/55 to-transparent" />

      {/* Atmospheric glow */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-12 -top-12 h-52 w-52 rounded-full bg-amber-400/8 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-32 w-32 rounded-full bg-amber-600/6 blur-2xl" />
      </div>

      {/* ── Badge bar ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-3 border-b border-amber-400/18 px-5 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/18 text-amber-400">
          <Sparkles size={12} />
        </span>
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="text-[11px] font-bold tracking-[0.28em] uppercase text-amber-400">
            TODAY&apos;S PICK
          </span>
          <span className="text-[10px] tracking-wide text-[var(--text-muted)]">
            Algorithm Curated — {pickDate}
          </span>
        </div>
        <span className="ml-auto shrink-0 text-[9px] tracking-[0.2em] uppercase text-[var(--text-muted)]">
          Auto Select
        </span>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center gap-5 px-5 py-5 sm:flex-row sm:items-start sm:gap-6 sm:px-6 sm:py-6">

        {/* Image */}
        {article.image_url && (
          <div className="mx-auto w-full max-w-[130px] shrink-0 sm:mx-0 sm:w-[145px] sm:max-w-none">
            <a href={href} target="_blank" rel="noopener noreferrer sponsored">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[var(--surface-2)] shadow-[0_8px_28px_rgba(0,0,0,0.65)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/proxy/image?url=${encodeURIComponent(article.image_url)}`}
                  alt={article.title}
                  className="absolute inset-0 h-full w-full object-cover object-right"
                />
              </div>
            </a>
          </div>
        )}

        {/* Content */}
        <div className="flex w-full min-w-0 flex-col gap-3">

          {/* Actress names */}
          {actresses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actresses.slice(0, 3).map(a => (
                <span key={a.id} className="text-[12px] font-semibold text-amber-300/80">
                  {a.name}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <a href={href} target="_blank" rel="noopener noreferrer sponsored" className="group">
            <h2 className="text-sm font-semibold leading-relaxed text-[var(--text)] transition-colors group-hover:text-amber-200 line-clamp-3">
              {article.title}
            </h2>
          </a>

          {/* Genre tags */}
          {genreTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genreTags.map(tag => (
                <Link
                  key={tag}
                  href={`/verity/genres/${encodeURIComponent(tag)}`}
                  className="rounded-full border border-amber-400/20 px-2 py-0.5 text-[10px] text-amber-400/60 transition-colors hover:border-amber-400/50 hover:text-amber-400"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {/* Summary */}
          {article.summary && (
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)] line-clamp-2">
              {article.summary}
            </p>
          )}

          {/* CTA */}
          <div className="mt-auto">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-5 py-2 text-xs font-bold text-amber-400 transition-all hover:border-amber-400/70 hover:bg-amber-400/20 hover:shadow-[0_0_18px_rgba(251,191,36,0.25)]"
            >
              この作品をチェックする
              <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
