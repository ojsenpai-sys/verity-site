import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { actressColor } from '@/lib/actressColor'
import { isBadImageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import type { Actress } from '@/lib/types'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

type RankedActress = {
  rank:    number
  points:  number
  actress: Actress
}

async function getRanking(): Promise<RankedActress[]> {
  const supabase = await createClient()

  const { data: rankRows, error: rankErr } = await supabase
    .rpc('get_actress_ranking', { p_brand_id: BRAND_ID, p_limit: 10 })

  if (rankErr || !rankRows || rankRows.length === 0) return []

  const externalIds = (rankRows as { actress_external_id: string; points: number }[])
    .map(r => r.actress_external_id)

  const { data: actresses } = await supabase
    .from('actresses')
    .select('id, external_id, name, ruby, image_url, metadata, is_active')
    .in('external_id', externalIds)
    .eq('is_active', true)

  const actressMap = new Map(
    ((actresses ?? []) as Actress[]).map(a => [a.external_id, a])
  )

  return (rankRows as { actress_external_id: string; points: number }[])
    .map((r, i) => {
      const actress = actressMap.get(r.actress_external_id)
      if (!actress) return null
      return { rank: i + 1, points: Number(r.points), actress }
    })
    .filter((r): r is RankedActress => r !== null)
}

function getProxiedSrc(actress: Actress): string | null {
  const raw = isBadImageUrl(actress.image_url) ? null : actress.image_url
  const url  = raw ?? (() => {
    const cid = actress.metadata?.latest_cid as string | undefined
    return cid ? cidToCdnUrl(cid, 'pl') : null
  })()
  if (!url) return null
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

// ── ランク装飾スタイル ────────────────────────────────────────────────────────

const RANK_STYLES: Record<number, {
  border:  string
  badge:   string
  label:   string
  glow:    string
}> = {
  1: {
    border: 'border-amber-400/70',
    badge:  'bg-amber-400 text-amber-900',
    label:  '1st',
    glow:   'shadow-[0_0_28px_rgba(251,191,36,0.3)]',
  },
  2: {
    border: 'border-slate-300/70',
    badge:  'bg-slate-300 text-slate-800',
    label:  '2nd',
    glow:   'shadow-[0_0_20px_rgba(203,213,225,0.2)]',
  },
  3: {
    border: 'border-amber-600/60',
    badge:  'bg-amber-700 text-amber-100',
    label:  '3rd',
    glow:   'shadow-[0_0_18px_rgba(180,83,9,0.25)]',
  },
}

// ── ランキングカード ──────────────────────────────────────────────────────────

function RankCard({ item }: { item: RankedActress }) {
  const { rank, actress } = item
  const imgSrc   = getProxiedSrc(actress)
  const top3      = RANK_STYLES[rank]
  const borderCls = top3?.border ?? 'border-[var(--border)]'
  const glowCls   = top3?.glow   ?? ''

  return (
    <Link
      href={`/verity/actresses/${actress.external_id}`}
      className={[
        'group relative flex flex-col rounded-xl border bg-[var(--surface)] overflow-hidden',
        'transition-all duration-200 hover:-translate-y-0.5',
        'hover:border-[var(--magenta)]/50 hover:shadow-[0_0_24px_rgba(226,0,116,0.18)]',
        borderCls, glowCls,
      ].join(' ')}
    >
      {/* 画像（表紙右側フォーカス） */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[var(--surface-2)]">
        {imgSrc ? (
          <>
            <ProxiedImage
              src={imgSrc}
              alt={actress.name}
              className="absolute inset-0 h-full w-full object-cover object-right
                         transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/70 via-transparent to-transparent" />
          </>
        ) : (
          <NowPrinting />
        )}

        {/* 順位バッジ */}
        {top3 ? (
          <div className={[
            'absolute left-2 top-2 flex h-7 w-7 items-center justify-center',
            'rounded-full text-[11px] font-black shadow-lg',
            top3.badge,
          ].join(' ')}>
            {rank}
          </div>
        ) : (
          <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center
                          rounded-full bg-[var(--surface)]/80 text-[10px] font-bold
                          text-[var(--text-muted)] ring-1 ring-[var(--border)]">
            {rank}
          </div>
        )}

        {/* 1位のみゴールドクラウン */}
        {rank === 1 && (
          <div className="absolute right-2 top-2 text-base leading-none" aria-hidden>
            👑
          </div>
        )}
      </div>

      {/* 女優名エリア */}
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2.5">
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center
                     rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: actressColor(actress.name) }}
        >
          {actress.name[0]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]
                         group-hover:text-[var(--magenta)] transition-colors">
          {actress.name}
        </span>
      </div>
    </Link>
  )
}

// ── セクション本体 ────────────────────────────────────────────────────────────

export async function PopularActressRankingSection() {
  const ranking = await getRanking()
  if (ranking.length === 0) return null

  const top3  = ranking.slice(0, 3)
  const rest  = ranking.slice(3)

  return (
    <section className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center gap-2.5">
        <Trophy size={17} className="text-amber-400" />
        <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
          VERITY 人気女優ランキング
        </h2>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
          Top {ranking.length}
        </span>
      </div>

      {/* Top 3：大きめカード */}
      <div className="grid grid-cols-3 gap-4">
        {top3.map(item => (
          <RankCard key={item.actress.id} item={item} />
        ))}
      </div>

      {/* 4位〜10位：コンパクトリスト */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rest.map(item => (
            <RankCard key={item.actress.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
