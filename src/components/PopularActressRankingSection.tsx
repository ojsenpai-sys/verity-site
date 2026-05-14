import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
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

  // 最新スナップショット日付を取得
  const { data: latest } = await supabase
    .from('actress_ranking_cache')
    .select('snapshot_date')
    .eq('brand_id', BRAND_ID)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return []

  // その日付のキャッシュを取得
  const { data: cache, error: cacheErr } = await supabase
    .from('actress_ranking_cache')
    .select('rank, points, actress_id, image_url')
    .eq('brand_id', BRAND_ID)
    .eq('snapshot_date', latest.snapshot_date)
    .order('rank', { ascending: true })
    .limit(10)

  if (cacheErr || !cache || cache.length === 0) return []

  const actressIds = cache.map(c => c.actress_id as string)

  const { data: actresses } = await supabase
    .from('actresses')
    .select('id, external_id, name, ruby, image_url, metadata, is_active')
    .in('id', actressIds)
    .eq('is_active', true)

  const actressMap = new Map(
    ((actresses ?? []) as Actress[]).map(a => [a.id, a])
  )

  return cache
    .map(c => {
      const actress = actressMap.get(c.actress_id as string)
      if (!actress) return null
      // キャッシュの最新単体作品画像を優先、なければ actresses.image_url
      const merged: Actress = {
        ...actress,
        image_url: (c.image_url as string | null) ?? actress.image_url,
      }
      return { rank: c.rank as number, points: Number(c.points), actress: merged }
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

function RankCard({
  item,
  className,
  heroOnMobile = false,
}: {
  item:           RankedActress
  className?:     string
  heroOnMobile?:  boolean
}) {
  const { rank, actress } = item
  const imgSrc   = getProxiedSrc(actress)
  const top3      = RANK_STYLES[rank]
  const borderCls = top3?.border ?? 'border-[var(--border)]'

  // 1位モバイルヒーローは強めのゴールドグロー、それ以外は標準
  const glowCls = heroOnMobile
    ? 'shadow-[0_0_48px_rgba(251,191,36,0.55)] sm:shadow-[0_0_28px_rgba(251,191,36,0.3)]'
    : (top3?.glow ?? '')

  return (
    <Link
      href={`/verity/actresses/${actress.external_id}`}
      className={[
        'group relative flex flex-col rounded-xl border bg-[var(--surface)] overflow-hidden',
        'transition-all duration-200 hover:-translate-y-0.5',
        'hover:border-[var(--magenta)]/50 hover:shadow-[0_0_24px_rgba(226,0,116,0.18)]',
        borderCls, glowCls,
        className ?? '',
      ].join(' ')}
    >
      {/* 画像（モバイルヒーローは縦長を抑えてワイドに、通常は 2:3 ポートレート） */}
      <div className={[
        'relative w-full overflow-hidden bg-[var(--surface-2)]',
        heroOnMobile ? 'aspect-[3/4] sm:aspect-[2/3]' : 'aspect-[2/3]',
      ].join(' ')}>
        {imgSrc ? (
          <>
            <ProxiedImage
              src={imgSrc}
              alt={actress.name}
              className="absolute inset-0 h-full w-full object-cover object-right
                         transition-transform duration-300 group-hover:scale-105"
            />
            <div className={[
              'absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent',
              heroOnMobile ? 'sm:from-[var(--surface)]/70' : '',
            ].join(' ')} />
          </>
        ) : (
          <NowPrinting />
        )}
      </div>

      {/* 女優名エリア — ランクバッジ・王冠を名前の隣に表示 */}
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-2.5">
        {/* 順位バッジ */}
        {top3 ? (
          <span className={[
            'inline-flex shrink-0 items-center justify-center rounded-full font-black shadow',
            heroOnMobile ? 'h-7 w-7 text-sm' : 'h-6 w-6 text-xs',
            top3.badge,
          ].join(' ')}>
            {rank}
          </span>
        ) : (
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center
                           rounded-full bg-[var(--surface-2)] text-[10px] font-bold
                           text-[var(--text-muted)] ring-1 ring-[var(--border)]">
            {rank}
          </span>
        )}
        {/* 1位の王冠 */}
        {rank === 1 && (
          <span className={[
            'shrink-0 leading-none',
            heroOnMobile ? 'text-xl' : 'text-base',
          ].join(' ')} aria-hidden>
            👑
          </span>
        )}
        <span className={[
          'min-w-0 flex-1 truncate font-semibold text-[var(--text)]',
          'group-hover:text-[var(--magenta)] transition-colors',
          heroOnMobile ? 'text-base sm:text-sm' : 'text-sm',
        ].join(' ')}>
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

  const [first, ...others] = ranking
  const top2and3 = others.slice(0, 2)
  const rest     = ranking.slice(3)

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

      {/*
        Top 3 グリッド
        モバイル (< sm): 2列グリッド — 1位が col-span-2（全幅）、2位・3位が各1列
        デスクトップ (sm+): 3列均等
      */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {first && (
          <RankCard
            item={first}
            className="col-span-2 sm:col-span-1"
            heroOnMobile
          />
        )}
        {top2and3.map(item => (
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
