import { Crown, Users, Tag, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getArticleScores, rankPercentile, formatPercentile } from '@/lib/articleScoring'
import type { Article } from '@/lib/types'

/**
 * 「この作品はどれくらい人気？」 — 同女優・同ジャンル・同メーカー内の
 * パーセンタイル順位を可視化。実数は出さず割合のみ。
 *
 * レビューサイトではないため星評価は使わず、user_events ベースのスコアで
 * 「相対的にどの位置にいるか」を購入判断補助として提示する。
 */

type Slice = {
  key:    'actress' | 'genre' | 'maker'
  label:  string
  icon:   React.ReactNode
  scope:  string
  pct:    number | null
  format: string | null
  accent: string
}

type Props = { article: Article }

type SupaClient = Awaited<ReturnType<typeof createClient>>

async function fetchCidsByActressName(supabase: SupaClient, name: string, limit = 200): Promise<string[]> {
  const { data } = await supabase
    .from('articles')
    .select('external_id')
    .eq('is_active', true)
    .contains('tags', [name])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return ((data ?? []) as { external_id: string }[]).map(r => r.external_id).filter(Boolean)
}

async function fetchCidsByGenres(supabase: SupaClient, tags: string[], limit = 300): Promise<string[]> {
  if (tags.length === 0) return []
  const { data } = await supabase
    .from('articles')
    .select('external_id')
    .eq('is_active', true)
    .overlaps('tags', tags)
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return ((data ?? []) as { external_id: string }[]).map(r => r.external_id).filter(Boolean)
}

async function fetchCidsByMakerId(supabase: SupaClient, makerId: number, limit = 200): Promise<string[]> {
  const { data } = await supabase
    .from('articles')
    .select('external_id')
    .eq('is_active', true)
    .filter('metadata->maker', 'cs', JSON.stringify([{ id: makerId }]))
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  return ((data ?? []) as { external_id: string }[]).map(r => r.external_id).filter(Boolean)
}

export async function PositioningBlock({ article }: Props) {
  if (!article.external_id) return null

  const supabase = await createClient()
  const meta = (article.metadata as Record<string, unknown> | null) ?? {}

  const actresses = (Array.isArray(meta.actress) ? meta.actress : []) as Array<{ id?: number; name?: string }>
  const makers    = (Array.isArray(meta.maker)   ? meta.maker   : []) as Array<{ id?: number; name?: string }>
  const actressNameSet = new Set(actresses.map(a => a.name).filter((n): n is string => !!n))

  const primaryActress = actresses[0]
  const primaryMaker   = makers[0]
  const genreTags      = (article.tags ?? []).filter(t => !actressNameSet.has(t) && !t.includes('VR')).slice(0, 3)

  // ── 各スコープの CID 母集団を並列取得 ─────────────────────────────────────
  const [actressCids, genreCids, makerCids] = await Promise.all([
    primaryActress?.name ? fetchCidsByActressName(supabase, primaryActress.name) : Promise.resolve([] as string[]),
    genreTags.length > 0 ? fetchCidsByGenres(supabase, genreTags)                : Promise.resolve([] as string[]),
    primaryMaker?.id     ? fetchCidsByMakerId(supabase, primaryMaker.id)         : Promise.resolve([] as string[]),
  ])

  // 自作品を必ず母集団に含める
  const ensureSelf = (arr: string[]) => arr.includes(article.external_id) ? arr : [...arr, article.external_id]

  const [scoreA, scoreG, scoreM] = await Promise.all([
    actressCids.length > 0 ? getArticleScores(ensureSelf(actressCids), 'all') : Promise.resolve(new Map<string, number>()),
    genreCids.length > 0   ? getArticleScores(ensureSelf(genreCids),   'all') : Promise.resolve(new Map<string, number>()),
    makerCids.length > 0   ? getArticleScores(ensureSelf(makerCids),   'all') : Promise.resolve(new Map<string, number>()),
  ])

  function buildSlice(
    key: Slice['key'],
    label: string,
    icon: React.ReactNode,
    scope: string,
    scoresMap: Map<string, number>,
    accent: string,
    sampleSize: number,
  ): Slice | null {
    if (sampleSize < 4) return null  // サンプルが少なすぎる場合は表示しない
    const my = scoresMap.get(article.external_id) ?? 0
    if (my === 0 && [...scoresMap.values()].every(v => v === 0)) return null
    const pct = rankPercentile(my, scoresMap)
    const formatted = formatPercentile(pct)
    if (!formatted) return null
    return { key, label, icon, scope, pct, format: formatted, accent }
  }

  const slices = [
    primaryActress?.name
      ? buildSlice(
          'actress',
          primaryActress.name,
          <Users size={11} />,
          `${primaryActress.name} の出演作品内`,
          scoreA,
          'border-[var(--magenta)]/40 bg-[var(--magenta)]/10 text-[var(--magenta)]',
          actressCids.length,
        )
      : null,
    genreTags.length > 0
      ? buildSlice(
          'genre',
          genreTags[0],
          <Tag size={11} />,
          `${genreTags[0]} ジャンル内`,
          scoreG,
          'border-amber-500/40 bg-amber-500/10 text-amber-300',
          genreCids.length,
        )
      : null,
    primaryMaker?.name && primaryMaker?.id
      ? buildSlice(
          'maker',
          primaryMaker.name,
          <Building2 size={11} />,
          `${primaryMaker.name} 作品内`,
          scoreM,
          'border-sky-500/40 bg-sky-500/10 text-sky-300',
          makerCids.length,
        )
      : null,
  ].filter((s): s is Slice => s !== null)

  if (slices.length === 0) return null

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <Crown size={14} className="text-[var(--magenta)]" />
        <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">
          この作品はどれくらい人気？
        </h2>
        <span className="rounded-full bg-[var(--magenta)]/12 px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase text-[var(--magenta)]">
          Positioning
        </span>
      </div>

      <p className="text-[11px] text-[var(--text-muted)]">
        FANZA遷移・視聴クリック等の実ユーザー行動から算出した相対順位です。レビュー・星評価は使用していません。
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {slices.map(s => {
          const widthPct = s.pct !== null ? Math.max(2, 100 - s.pct) : 0
          return (
            <div
              key={s.key}
              className={[
                'relative overflow-hidden rounded-xl border p-3 space-y-1.5',
                s.accent,
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase opacity-80">
                  {s.icon}
                  {s.label}
                </span>
                <span className="text-base font-black tabular-nums">{s.format}</span>
              </div>
              <p className="text-[10px] opacity-70 leading-relaxed">{s.scope}</p>
              {/* プログレスバー */}
              <div className="relative h-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-current opacity-70"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
