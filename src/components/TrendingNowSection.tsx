import Link from 'next/link'
import { TrendingUp, Flame, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cidToCdnUrl, coverPosClass, isBadImageUrl, toHighResPackageUrl } from '@/lib/cidUtils'

type TrendActress = {
  external_id: string
  name:        string
  image_url:   string | null
  metadata:    Record<string, unknown> | null
  cnt_now:     number
  cnt_prev:    number
  score:       number
}

type TrendArticle = {
  external_id: string
  title:       string
  slug:        string
  image_url:   string | null
  tags:        string[] | null
  metadata:    Record<string, unknown> | null
  cnt_now:     number
  cnt_prev:    number
  score:       number
}

function actressProxySrc(row: TrendActress): string | null {
  const cid = row.metadata?.latest_cid as string | undefined
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  const raw = isBadImageUrl(row.image_url) ? null : row.image_url
  const url = toHighResPackageUrl(raw)
  if (!url) return null
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

function articleProxySrc(row: TrendArticle): string | null {
  const raw = isBadImageUrl(row.image_url) ? null : row.image_url
  const url = toHighResPackageUrl(raw)
  if (!url) return null
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

function TrendBadge({ now, prev }: { now: number; prev: number }) {
  const isNew  = prev === 0 && now > 0
  const pct    = prev > 0 ? Math.round(((now - prev) / prev) * 100) : null
  const rising = isNew || (pct !== null && pct > 0)

  if (isNew) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--magenta)]/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-[var(--magenta)] border border-[var(--magenta)]/30">
        <Flame size={8} />
        NEW
      </span>
    )
  }
  if (rising && pct !== null) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-emerald-400 border border-emerald-500/30">
        <ChevronUp size={8} />
        +{pct}%
      </span>
    )
  }
  return null
}

async function getTrending() {
  const supabase = await createClient()

  // 24h 優先、0件なら 168h (7日) にフォールバック
  const [{ data: a24 }, { data: ar24 }] = await Promise.all([
    supabase.rpc('get_trending_actresses', { p_limit: 5, p_hours: 24 }),
    supabase.rpc('get_trending_articles',  { p_limit: 5, p_hours: 24 }),
  ])

  let actresses = (a24  ?? []) as TrendActress[]
  let articles  = (ar24 ?? []) as TrendArticle[]

  if (actresses.length === 0 && articles.length === 0) {
    const [{ data: a7 }, { data: ar7 }] = await Promise.all([
      supabase.rpc('get_trending_actresses', { p_limit: 5, p_hours: 168 }),
      supabase.rpc('get_trending_articles',  { p_limit: 5, p_hours: 168 }),
    ])
    actresses = (a7  ?? []) as TrendActress[]
    articles  = (ar7 ?? []) as TrendArticle[]
  }

  return { actresses, articles }
}

export async function TrendingNowSection() {
  const { actresses, articles } = await getTrending()
  if (actresses.length === 0 && articles.length === 0) return null

  return (
    <section className="space-y-5">

      {/* ヘッダー */}
      <div className="flex items-center gap-2.5">
        <TrendingUp size={17} className="text-emerald-400" />
        <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
          TRENDING NOW
        </h2>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
          急上昇
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

        {/* ── 急上昇女優 ─────────────────────────────────────────── */}
        {actresses.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
              急上昇 女優
            </p>
            <ol className="space-y-2">
              {actresses.map((row, i) => {
                const imgSrc = actressProxySrc(row)
                return (
                  <li key={row.external_id}>
                    <Link
                      href={`/verity/actresses/${row.external_id}`}
                      className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    >
                      {/* 順位 */}
                      <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-[var(--text-muted)]">
                        {i + 1}
                      </span>

                      {/* サムネイル — h-16 w-12 に拡大、emerald ring で浮かせる */}
                      <div className="relative h-16 w-12 sm:h-[72px] sm:w-[54px] shrink-0 overflow-hidden rounded-md
                                      bg-[var(--surface-2)] ring-1 ring-emerald-500/15
                                      shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                        {imgSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgSrc}
                            alt={row.name}
                            className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(row.image_url ?? (row.metadata?.latest_cid ? cidToCdnUrl(row.metadata.latest_cid as string, 'pl') : null))}`}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-[var(--surface-2)]" />
                        )}
                      </div>

                      {/* 名前 + バッジ */}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold text-[var(--text)] group-hover:text-emerald-400 transition-colors">
                          {row.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <TrendBadge now={Number(row.cnt_now)} prev={Number(row.cnt_prev)} />
                          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
                            {Number(row.cnt_now).toLocaleString()} views
                          </span>
                        </div>
                      </div>

                      {/* トレンドアイコン */}
                      <TrendingUp
                        size={13}
                        className="shrink-0 text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {/* ── 急上昇作品 ─────────────────────────────────────────── */}
        {articles.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
              急上昇 作品
            </p>
            <ol className="space-y-2">
              {articles.map((row, i) => {
                const imgSrc = articleProxySrc(row)
                const actress = (row.tags ?? []).find(t => t.length > 1) ?? null
                return (
                  <li key={row.external_id}>
                    <Link
                      href={`/verity/articles/${row.slug}`}
                      className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                    >
                      {/* 順位 */}
                      <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-[var(--text-muted)]">
                        {i + 1}
                      </span>

                      {/* サムネイル — h-16 w-12 に拡大、emerald ring で浮かせる */}
                      <div className="relative h-16 w-12 sm:h-[72px] sm:w-[54px] shrink-0 overflow-hidden rounded-md
                                      bg-[var(--surface-2)] ring-1 ring-emerald-500/15
                                      shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                        {imgSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgSrc}
                            alt={row.title}
                            className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(row.image_url)}`}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-[var(--surface-2)]" />
                        )}
                      </div>

                      {/* タイトル + バッジ */}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 text-xs font-semibold leading-snug text-[var(--text)] group-hover:text-emerald-400 transition-colors">
                          {row.title}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <TrendBadge now={Number(row.cnt_now)} prev={Number(row.cnt_prev)} />
                          {actress && (
                            <span className="truncate text-[10px] text-[var(--text-muted)]">
                              {actress}
                            </span>
                          )}
                        </div>
                      </div>

                      <TrendingUp
                        size={13}
                        className="shrink-0 text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

      </div>
    </section>
  )
}
