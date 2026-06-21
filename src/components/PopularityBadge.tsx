import { Flame, TrendingUp, Sparkles, Award, Infinity as InfinityIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import {
  getArticleScores,
  getRecentVsPriorScores,
} from '@/lib/articleScoring'
import type { Article } from '@/lib/types'

/**
 * 作品ページの人気シグナル可視化 — 実ユーザー行動 (user_events) ベース。
 *
 * 判定:
 *   - 急上昇:  直近30日 / 過去30日 のスコア比が 1.5 以上 かつ 直近5pt以上
 *   - 人気作品: 同ジャンル全期間スコア中で上位10%以内
 *   - 話題作:  公開90日以内 かつ 全期間スコアが同ジャンル中央値の2倍以上
 *   - 定番作品: 公開180日以上 かつ 直近30日スコアが同ジャンル中央値以上
 *   - ロングヒット: 公開365日以上 かつ 直近30日スコア > 0
 *
 * 最大 2 バッジ。優先順位: 急上昇 > 人気作品 > 話題作 > 定番 > ロングヒット
 */

type Badge = {
  key:    'rising' | 'popular' | 'buzz' | 'staple' | 'longhit'
  label:  string
  caption: string
  icon:   React.ReactNode
  cls:    string
}

const BADGE_DEFS: Record<Badge['key'], Omit<Badge, 'key'>> = {
  rising: {
    label:   '急上昇',
    caption: '直近30日でアクセス急増',
    icon:    <Flame size={11} />,
    cls:     'border-emerald-500/50 bg-emerald-500/12 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.25)]',
  },
  popular: {
    label:   '人気作品',
    caption: '同ジャンルで上位10%',
    icon:    <TrendingUp size={11} />,
    cls:     'border-amber-500/50 bg-amber-500/12 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]',
  },
  buzz: {
    label:   '話題作',
    caption: '公開90日以内の注目作',
    icon:    <Sparkles size={11} />,
    cls:     'border-rose-500/50 bg-rose-500/12 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.22)]',
  },
  staple: {
    label:   '定番作品',
    caption: '長く支持され続けている',
    icon:    <Award size={11} />,
    cls:     'border-sky-500/50 bg-sky-500/12 text-sky-300 shadow-[0_0_10px_rgba(14,165,233,0.22)]',
  },
  longhit: {
    label:   'ロングヒット',
    caption: '公開1年以上で根強い流入',
    icon:    <InfinityIcon size={11} />,
    cls:     'border-violet-500/50 bg-violet-500/12 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.22)]',
  },
}

function pickBadges(flags: Record<Badge['key'], boolean>): Badge[] {
  const order: Badge['key'][] = ['rising', 'popular', 'buzz', 'staple', 'longhit']
  const out: Badge[] = []
  for (const key of order) {
    if (!flags[key]) continue
    out.push({ key, ...BADGE_DEFS[key] })
    if (out.length >= 2) break
  }
  return out
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

type Props = { article: Article }

export async function PopularityBadge({ article }: Props) {
  if (!article.external_id || !article.published_at) return null

  const supabase = await createClient()

  // ── 同ジャンルの母集団 (女優タグを除いた最大3タグ) を最大400件取得 ─────────
  const meta = (article.metadata as Record<string, unknown> | null) ?? {}
  const actresses = Array.isArray(meta.actress) ? (meta.actress as Array<{ name?: string }>) : []
  const actressNameSet = new Set(actresses.map(a => a.name).filter((n): n is string => !!n))
  const genreTags = (article.tags ?? []).filter(t => !actressNameSet.has(t) && !t.includes('VR')).slice(0, 3)

  let peerCids: string[] = [article.external_id]
  if (genreTags.length > 0) {
    const { data: peers } = await supabase
      .from('articles')
      .select('external_id')
      .eq('is_active', true)
      .overlaps('tags', genreTags)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .limit(400)
    const ids = ((peers ?? []) as { external_id: string }[]).map(r => r.external_id).filter(Boolean)
    if (ids.length > 0) peerCids = [...new Set([article.external_id, ...ids])]
  }

  // ── 全期間 & 直近30日スコア集計 ─────────────────────────────────────────
  const [allScores, rv] = await Promise.all([
    getArticleScores(peerCids, 'all'),
    getRecentVsPriorScores([article.external_id], 30),
  ])

  const myAllScore = allScores.get(article.external_id) ?? 0
  const peerScores = [...allScores.values()]
  const peerMedian = median(peerScores)
  const top10Threshold = (() => {
    if (peerScores.length === 0) return Infinity
    const sorted = [...peerScores].sort((a, b) => b - a)
    const idx    = Math.max(0, Math.floor(sorted.length * 0.1) - 1)
    return sorted[idx] ?? sorted[sorted.length - 1]
  })()

  const r = rv.get(article.external_id) ?? { recent: 0, prior: 0 }
  const ratio = r.prior > 0 ? r.recent / r.prior : (r.recent > 0 ? Infinity : 0)

  const ageDays = (Date.now() - new Date(article.published_at).getTime()) / (24 * 3_600_000)

  // ── 判定 ────────────────────────────────────────────────────────────────
  const flags: Record<Badge['key'], boolean> = {
    rising:  r.recent >= 5 && ratio >= 1.5,
    popular: peerScores.length >= 8 && myAllScore > 0 && myAllScore >= top10Threshold,
    buzz:    ageDays <= 90 && peerMedian > 0 && myAllScore >= peerMedian * 2,
    staple:  ageDays >= 180 && peerMedian > 0 && r.recent >= peerMedian,
    longhit: ageDays >= 365 && r.recent > 0,
  }

  const badges = pickBadges(flags)
  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="popularity-badges">
      <span className="text-[9px] tracking-widest uppercase text-[var(--text-muted)]">人気シグナル</span>
      {badges.map(b => (
        <span
          key={b.key}
          title={b.caption}
          className={[
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors',
            b.cls,
          ].join(' ')}
        >
          {b.icon}
          {b.label}
        </span>
      ))}
    </div>
  )
}
