import Link from 'next/link'
import { Crown, Sparkles, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'
import { NowPrinting } from '@/components/NowPrinting'
import { ProxiedImage } from '@/components/ProxiedImage'
import { getArticleScores } from '@/lib/articleScoring'
import type { Article } from '@/lib/types'

/**
 * 女優ページ「代表作 (Signature Works)」セクション
 *
 * 選定: user_events 全期間スコア (fanza_click*5 + video_view*2 + page_view*1) 上位5件。
 * ただしスコアが取れない作品が多い初期段階は published_at desc を併用フォールバック。
 *
 * バッジ:
 *   - 代表作 (上位1)
 *   - 人気作 (上位2-3)
 *   - デビュー作 (最古作品が候補に入っていれば付与)
 */

function proxyJacket(article: Article): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  if (article.external_id) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
  return null
}

function articleFanzaUrl(article: Article): string | null {
  const m = article.metadata as Record<string, unknown> | null
  const raw =
    (typeof m?.affiliate_url === 'string' ? m.affiliate_url as string : null) ??
    (article.source === 'dmm' && typeof m?.url === 'string' ? (m.url as string) : null)
  return withAffiliate(raw)
}

type Badge = { label: string; cls: string; icon: React.ReactNode }

const BADGE_TOP: Badge = {
  label: '代表作',
  cls:   'bg-amber-400 text-amber-900 shadow-[0_0_14px_rgba(251,191,36,0.5)]',
  icon:  <Crown size={9} />,
}
const BADGE_POPULAR: Badge = {
  label: '人気作',
  cls:   'bg-[var(--magenta)]/90 text-white shadow-[0_0_12px_rgba(226,0,116,0.45)]',
  icon:  <Sparkles size={9} />,
}
const BADGE_DEBUT: Badge = {
  label: 'デビュー作',
  cls:   'bg-sky-500/90 text-white shadow-[0_0_12px_rgba(14,165,233,0.4)]',
  icon:  <Award size={9} />,
}

type Props = {
  actressId:   string
  actressName: string
  /** ruby / aliases 含めた検索用名前リスト */
  searchNames: string[]
}

export async function SignatureWorks({ actressName, searchNames }: Props) {
  const supabase = await createClient()

  // ── 女優の全作品 (最新500件) を取得 ───────────────────────────────────────
  const { data: rows } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .overlaps('tags', searchNames)
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(500)

  const articles = ((rows ?? []) as Article[])
  if (articles.length === 0) return null

  // ── user_events 全期間スコア集計 ───────────────────────────────────────
  const cids = articles.map(a => a.external_id).filter(Boolean)
  const scores = await getArticleScores(cids, 'all')

  // 最古作品 (デビュー候補)
  const oldestId = [...articles]
    .filter(a => a.published_at)
    .sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''))[0]?.id ?? null

  // ── 上位5件選定: スコア降順 → 同点は新しい順、スコア0群は published_at 降順 ─
  const withScores = articles.map(a => ({
    article: a,
    score:   scores.get(a.external_id) ?? 0,
  }))
  const sortedByScore = [...withScores].sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score
    return (y.article.published_at ?? '').localeCompare(x.article.published_at ?? '')
  })
  const top5 = sortedByScore.slice(0, 5)
  if (top5.length === 0) return null

  // 全件スコア=0 ならランダム選別ではなく「最新5件」を素直に出す (初期データ段階)
  const allZero = top5.every(s => s.score === 0)

  function badgesFor(idx: number, articleId: string): Badge[] {
    const out: Badge[] = []
    if (!allZero) {
      if (idx === 0) out.push(BADGE_TOP)
      else if (idx <= 2) out.push(BADGE_POPULAR)
    }
    if (articleId === oldestId) out.push(BADGE_DEBUT)
    return out
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <Crown size={14} className="text-amber-400" />
        <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">
          {actressName} の代表作
        </h2>
        <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase text-amber-300">
          Signature Works
        </span>
        {allZero && (
          <span className="text-[10px] text-[var(--text-muted)]">
            ※ アクセスデータ蓄積中 — 最新順で表示
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {top5.map(({ article: a }, idx) => {
          const img = proxyJacket(a)
          const fanza = articleFanzaUrl(a)
          const badges = badgesFor(idx, a.id)
          const ImgEl = img ? (
            <ProxiedImage
              src={img}
              alt={a.title}
              className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(a.image_url)} transition-transform duration-300 group-hover/sw:scale-105`}
            />
          ) : <NowPrinting />

          return (
            <div key={a.id} className="flex flex-col gap-1.5">
              {fanza ? (
                <FanzaLink
                  href={fanza}
                  targetId={a.external_id}
                  position="signature_work"
                  className="group/sw relative block aspect-[2/3] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] transition-all hover:border-amber-400/60 hover:shadow-[0_0_22px_rgba(251,191,36,0.25)]"
                >
                  {ImgEl}
                  {badges.length > 0 && (
                    <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                      {badges.map(b => (
                        <span key={b.label} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black tracking-widest ${b.cls}`}>
                          {b.icon}
                          {b.label}
                        </span>
                      ))}
                    </div>
                  )}
                </FanzaLink>
              ) : (
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
                  {ImgEl}
                </div>
              )}
              <Link
                href={`/verity/articles/${a.slug}`}
                className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text)] transition-colors hover:text-amber-300"
              >
                {a.title}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
