import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, LayoutGrid, Pin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'ジャンル一覧 — VERITY',
  description: 'VERITYが収録するジャンル別最新作カタログ。中出し・単体・4K・人妻・熟女など人気ジャンルの最新AVをFANZA公式データから自動更新。',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/verity/genres` },
}

// ─── Neon accent palette ──────────────────────────────────────────────────────

const NEON_ACCENTS = [
  { border: 'border-[var(--magenta)]/25', glow: 'hover:border-[var(--magenta)]/55 hover:shadow-[0_0_18px_rgba(226,0,116,0.15)]', count: 'text-[var(--magenta)]/60' },
  { border: 'border-violet-500/25',       glow: 'hover:border-violet-400/55 hover:shadow-[0_0_18px_rgba(139,92,246,0.15)]',       count: 'text-violet-400/60' },
  { border: 'border-sky-500/25',          glow: 'hover:border-sky-400/55 hover:shadow-[0_0_18px_rgba(56,189,248,0.15)]',          count: 'text-sky-400/60' },
  { border: 'border-amber-500/25',        glow: 'hover:border-amber-400/55 hover:shadow-[0_0_18px_rgba(251,191,36,0.15)]',        count: 'text-amber-400/60' },
  { border: 'border-emerald-500/25',      glow: 'hover:border-emerald-400/55 hover:shadow-[0_0_18px_rgba(52,211,153,0.15)]',      count: 'text-emerald-400/60' },
  { border: 'border-rose-500/25',         glow: 'hover:border-rose-400/55 hover:shadow-[0_0_18px_rgba(251,113,133,0.15)]',        count: 'text-rose-400/60' },
]

// ─── 強制ピン留めジャンル — 上位80位に入らなくても必ず表示 ──────────────────────
// DMM Affiliate API v3 の正式ジャンル名を使用。
// 表記揺れ対応: タグに複数名称が混在する場合は最もヒット数の多い名称を採用。

const PINNED_GENRES = ['キャバ嬢・風俗嬢', 'ヘルス・ソープ'] as const

// ─── 女優名ブラックリスト — DBの女優テーブルに未収録でも除外が必要な名前 ─────────
// DMM API のジャンルフィールドに女優名が混入した際の安全ネット。
// 発見次第ここに追加する。

const ACTRESS_NAME_BLACKLIST = new Set([
  '三上悠亜',
  '波多野結衣',
  '蒼井そら',
  '吉沢明歩',
  '天海つばさ',
  '夏目彩春',
  '明日花キララ',
  '初音みのり',
  '加藤ももか',
  '桐嶋もも',
])

// ─── Data ─────────────────────────────────────────────────────────────────────

async function getGenres(): Promise<{
  pinned: Array<{ tag: string; count: number }>
  regular: Array<{ tag: string; count: number }>
}> {
  const supabase = await createClient()

  const [{ data: tagRows }, { data: actressRows }] = await Promise.all([
    supabase
      .from('articles')
      .select('tags')
      .eq('is_active', true)
      .not('tags', 'is', null)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .limit(5000),
    supabase
      .from('actresses')
      .select('name')
      .eq('is_active', true),
  ])

  // DB の女優名 + ブラックリスト の両方で除外
  const actressNames = new Set([
    ...ACTRESS_NAME_BLACKLIST,
    ...((actressRows ?? []).map(a => a.name as string)),
  ])

  const tagCounts = new Map<string, number>()
  for (const row of tagRows ?? []) {
    for (const t of (row.tags as string[]) ?? []) {
      if (t && !actressNames.has(t)) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
      }
    }
  }

  // ピン留めジャンルを先に抽出（rankingには含めない）
  const pinnedSet = new Set<string>(PINNED_GENRES)
  const pinned = PINNED_GENRES.map(tag => ({ tag, count: tagCounts.get(tag) ?? 0 }))

  // 上位 80 件（ピン留めを除外）
  const regular = [...tagCounts.entries()]
    .filter(([tag]) => !pinnedSet.has(tag))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([tag, count]) => ({ tag, count }))

  return { pinned, regular }
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function GenresIndexPage() {
  const { pinned, regular } = await getGenres()

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

      {/* パンくず */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">ジャンル</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <LayoutGrid size={20} className="text-[var(--magenta)]" />
          <h1 className="text-3xl font-black tracking-tight text-[var(--text)]">
            ジャンル一覧
          </h1>
        </div>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">
          {regular.length + pinned.length}ジャンルの最新作・予約作品を毎日 0:00 JST に自動巡回。
          ジャンルをクリックして専用の最新作カタログにアクセスできます。
        </p>
      </div>

      {/* ピン留めジャンル */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <Pin size={11} />
          注目ジャンル
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {pinned.map(({ tag, count }, idx) => {
            const accent = NEON_ACCENTS[idx % NEON_ACCENTS.length]
            return (
              <Link
                key={tag}
                href={`/verity/genres/${encodeURIComponent(tag)}`}
                className={`group flex flex-col gap-1.5 rounded-xl border bg-white/[0.03] backdrop-blur-sm px-4 py-3.5 transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.06] ${accent.border} ${accent.glow}`}
              >
                <p className="text-[13px] font-bold leading-snug text-[var(--text)] group-hover:text-white transition-colors">
                  {tag}
                </p>
                <p className={`text-[10px] font-medium tabular-nums ${accent.count}`}>
                  {count > 0 ? `${count.toLocaleString()} 作品` : '—'}
                </p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* 区切り線 */}
      <div className="h-px bg-[var(--border)]" />

      {/* 全ジャンルグリッド */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          全ジャンル（作品数順）
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {regular.map(({ tag, count }, idx) => {
            const accent = NEON_ACCENTS[idx % NEON_ACCENTS.length]
            return (
              <Link
                key={tag}
                href={`/verity/genres/${encodeURIComponent(tag)}`}
                className={`group flex flex-col gap-1.5 rounded-xl border bg-white/[0.03] backdrop-blur-sm px-3 py-3.5 transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.06] ${accent.border} ${accent.glow}`}
              >
                <p className="text-[13px] font-bold leading-snug text-[var(--text)] group-hover:text-white transition-colors line-clamp-2">
                  {tag}
                </p>
                <p className={`text-[10px] font-medium tabular-nums ${accent.count}`}>
                  {count.toLocaleString()} 作品
                </p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* フッター */}
      <p className="text-center text-[11px] text-[var(--text-muted)]">
        作品情報は FANZA Affiliate API v3 より取得。毎日 0:00 JST に自動更新。
      </p>
    </div>
  )
}
