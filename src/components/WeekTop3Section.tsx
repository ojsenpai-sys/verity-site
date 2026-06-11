import Link from 'next/link'
import { Trophy, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'
import { FanzaLink } from './FanzaLink'
import type { Article } from '@/lib/types'

function proxyUrl(url: string) {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

function computeVerityScore(article: Article): number {
  const pubMs   = article.published_at ? new Date(article.published_at).getTime() : 0
  const ageDays = (Date.now() - pubMs) / (1000 * 60 * 60 * 24)
  const fresh   = Math.max(0, 1 - ageDays / 7)
  const list    = (article.metadata as Record<string, unknown>)?.actress
  const bonus   = Array.isArray(list)
    ? (list.length === 1 ? 2.0 : list.length === 2 ? 1.5 : 1.0)
    : 1.0
  // Map to 7.5–9.9 range
  return Math.min(9.9, 7.5 + fresh * bonus * 1.2)
}

const RANK_STYLES = [
  {
    label: '#1',
    ring:  'ring-amber-400/60',
    glow:  'shadow-[0_0_24px_rgba(245,158,11,0.20)]',
    score: 'text-amber-300',
    cta:   'from-amber-500 to-orange-500 shadow-[0_0_14px_rgba(245,158,11,0.30)]',
  },
  {
    label: '#2',
    ring:  'ring-slate-400/40',
    glow:  'shadow-[0_0_12px_rgba(150,150,170,0.10)]',
    score: 'text-slate-300',
    cta:   'from-pink-600 to-rose-600',
  },
  {
    label: '#3',
    ring:  'ring-orange-700/40',
    glow:  '',
    score: 'text-orange-400',
    cta:   'from-pink-600 to-rose-600',
  },
] as const

async function getTop3Articles(): Promise<Article[]> {
  const supabase     = await createClient()
  const now          = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gte('published_at', sevenDaysAgo)
    .lte('published_at', now.toISOString())
    .not('image_url', 'is', null)
    .order('published_at', { ascending: false })
    .limit(40)

  const deduped = deduplicateDigitalFirst((data as Article[]) ?? [])
  const candidates = deduped.filter(a => {
    const url = (a.metadata as Record<string, unknown>)?.url as string | undefined
    return !url?.includes('/dc/doujin/')
  })

  return candidates
    .map(a => ({ a, score: computeVerityScore(a) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, 3)
    .map(({ a }) => a)
}

export async function WeekTop3Section() {
  const [articles, isOverseas] = await Promise.all([getTop3Articles(), getIsOverseasUser()])
  if (!articles.length) return null

  return (
    <div className="space-y-3 pb-1">
      <div className="flex items-center gap-2">
        <Trophy size={13} className="text-amber-400" />
        <span className="text-[10px] font-black tracking-[0.22em] uppercase text-amber-400">
          Verity Score — Top 3
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-amber-400/30 to-transparent" />
        <span className="text-[9px] text-[var(--text-muted)]">編集部スコア</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {articles.map((article, idx) => {
          const s      = RANK_STYLES[idx]!
          const score  = computeVerityScore(article)
          const meta   = (article.metadata ?? {}) as Record<string, unknown>
          const rawUrl = (meta.affiliate_url ?? meta.url) as string | null
          const affUrl = withAffiliateForRegion(rawUrl, isOverseas)
          const imgUrl = article.image_url ? proxyUrl(article.image_url) : null
          const actresses: Array<{ id: number; name: string }> = Array.isArray(meta.actress)
            ? (meta.actress as Array<{ id: number; name: string }>)
            : []

          return (
            <article
              key={article.id}
              className={`relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] ring-1 ${s.ring} ${s.glow} transition-all duration-200 hover:-translate-y-0.5`}
            >
              {/* Rank badge */}
              <div className={`absolute left-2.5 top-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-[11px] font-black ${s.score}`}>
                {s.label}
              </div>

              {/* Cover image */}
              {affUrl && imgUrl ? (
                <FanzaLink
                  href={affUrl}
                  targetId={article.external_id}
                  position="grid_top3"
                  className="group/t3 relative block aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgUrl}
                    alt={article.title}
                    className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover/t3:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="rounded-full border border-amber-400/40 bg-black/75 px-2 py-0.5 text-[8px] font-black tracking-widest uppercase text-amber-300">
                      Verity Score
                    </span>
                    <div className="flex items-end gap-0.5 rounded-lg bg-black/80 px-2 py-0.5">
                      <span className={`text-base font-black leading-none ${s.score}`}>
                        {score.toFixed(1)}
                      </span>
                      <span className="mb-0.5 text-[8px] font-bold text-white/40">/10</span>
                    </div>
                  </div>
                </FanzaLink>
              ) : imgUrl ? (
                <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgUrl} alt={article.title} className="absolute inset-0 h-full w-full object-cover object-right" />
                </div>
              ) : null}

              <div className="flex flex-1 flex-col gap-2 p-3">
                {actresses.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {actresses.slice(0, 2).map(a => (
                      <Link
                        key={a.id || a.name}
                        href={a.id > 0 ? `/verity/actresses/dmm-actress-${a.id}` : '#'}
                        className="text-[11px] font-bold text-[var(--magenta)] hover:underline"
                      >
                        {a.name}
                      </Link>
                    ))}
                  </div>
                )}
                <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--text)]">
                  {article.title}
                </h3>
                {affUrl && (
                  <FanzaLink
                    href={affUrl}
                    targetId={article.external_id}
                    position="grid_top3"
                    className={`mt-auto flex items-center justify-center gap-1.5 rounded-md bg-gradient-to-r ${s.cta} py-2 text-[11px] font-black text-white transition-all hover:brightness-110 active:scale-[0.97]`}
                  >
                    ▶ FANZAで今すぐ観る
                    <ExternalLink size={10} />
                  </FanzaLink>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
