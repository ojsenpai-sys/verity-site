import type { Metadata } from 'next'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { cidToCdnUrl } from '@/lib/cidUtils'
import { ActressCard } from './ActressCard'
import { SearchInput } from './SearchInput'
import { Pagination } from './Pagination'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: '女優一覧',
  description: 'VERITYに登録された1,100名超の女優を50音・ジャンルで検索。最新作・人気作をFANZAで即チェック。',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/actresses` },
}

const PAGE_SIZE = 48

// ── 50音行定義 ────────────────────────────────────────────────────────────────

const GOJUON: Array<{ label: string; test: (ruby: string) => boolean }> = [
  { label: 'あ', test: r => /^[あいうえおぁぃぅぇぉ]/.test(r) },
  { label: 'か', test: r => /^[かきくけこがぎぐげご]/.test(r) },
  { label: 'さ', test: r => /^[さしすせそざじずぜぞ]/.test(r) },
  { label: 'た', test: r => /^[たちつてとだぢづでどっ]/.test(r) },
  { label: 'な', test: r => /^[なにぬねの]/.test(r) },
  { label: 'は', test: r => /^[はひふへほばびぶべぼぱぴぷぺぽ]/.test(r) },
  { label: 'ま', test: r => /^[まみむめも]/.test(r) },
  { label: 'や', test: r => /^[やゆよゃゅょ]/.test(r) },
  { label: 'ら', test: r => /^[らりるれろ]/.test(r) },
  { label: 'わ', test: r => /^[わをんヲン]/.test(r) },
  { label: 'A', test: r => /^[a-zA-Z]/.test(r) },
]

// PostgreSQL regex per row（サーバーサイドフィルタ用）
const GOJUON_REGEX: Record<string, string> = {
  'あ': '^[あいうえおぁぃぅぇぉ]',
  'か': '^[かきくけこがぎぐげご]',
  'さ': '^[さしすせそざじずぜぞ]',
  'た': '^[たちつてとだぢづでどっ]',
  'な': '^[なにぬねの]',
  'は': '^[はひふへほばびぶべぼぱぴぷぺぽ]',
  'ま': '^[まみむめも]',
  'や': '^[やゆよゃゅょ]',
  'ら': '^[らりるれろ]',
  'わ': '^[わをんヲン]',
  'A': '^[a-zA-Z]',
}

function getRow(ruby: string | null): string {
  if (!ruby) return 'わ'
  const r = ruby.trim()
  for (const row of GOJUON) {
    if (row.test(r)) return row.label
  }
  return 'わ'
}

// ── 型 ───────────────────────────────────────────────────────────────────────

type ActressRow = {
  external_id: string
  name:        string
  ruby:        string | null
  image_url:   string | null
  metadata:    Record<string, unknown> | null
}

// ── 画像 URL 解決（3段階フォールバック） ─────────────────────────────────────

function actressThumb(actress: ActressRow, fallbackMap?: Map<string, string>): string | null {
  if (actress.image_url) {
    return `/verity/api/proxy/image?url=${encodeURIComponent(actress.image_url)}`
  }
  const cid = actress.metadata?.latest_cid as string | null | undefined
  if (cid) {
    return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  }
  const fallback = fallbackMap?.get(actress.external_id)
  if (fallback) {
    return `/verity/api/proxy/image?url=${encodeURIComponent(fallback)}`
  }
  return null
}

// ── 過去作フォールバック画像マップ ───────────────────────────────────────────

async function buildFallbackMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actresses: ActressRow[],
): Promise<Map<string, string>> {
  const noImage = actresses.filter(a => !a.image_url && !(a.metadata?.latest_cid))
  if (noImage.length === 0) return new Map()

  const dmmIds = noImage
    .map(a => { const m = a.external_id.match(/^dmm-actress-(\d+)$/); return m ? parseInt(m[1]) : null })
    .filter((id): id is number => id !== null)

  if (dmmIds.length === 0) return new Map()

  const { data } = await supabase.rpc('get_actress_fallback_images', { actress_ids: dmmIds })
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ dmm_id: number; image_url: string }>) {
    map.set(`dmm-actress-${row.dmm_id}`, row.image_url)
  }
  return map
}

// ── ページ ────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams: Promise<{ q?: string; row?: string; page?: string }>
}

export default async function ActressesPage({ searchParams }: PageProps) {
  const { q: rawQ, row: rawRow, page: rawPage } = await searchParams
  const q    = rawQ?.trim() ?? ''
  const row  = rawRow?.trim() ?? ''
  const page = Math.max(1, parseInt(rawPage ?? '1') || 1)

  const supabase = await createClient()
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  // ── クエリ構築 ─────────────────────────────────────────────────────────────
  // .range() を必ず指定することでSupabaseのデフォルト1000行制限を回避する

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let baseQuery: any = supabase
    .from('actresses')
    .select('external_id, name, ruby, image_url, metadata', { count: 'exact' })
    .eq('is_active', true)
    .order('ruby', { ascending: true, nullsFirst: false })

  if (q) {
    // 検索: 名前 or よみがな
    baseQuery = baseQuery.or(`name.ilike.%${q}%,ruby.ilike.%${q}%`)
  } else if (row && GOJUON_REGEX[row]) {
    // 50音行フィルタ: PostgreSQL正規表現
    baseQuery = baseQuery.filter('ruby', 'match', GOJUON_REGEX[row])
  }
  // わ行は null ruby も含める（フィルタなし＝デフォルトビューでのみ末尾に表示）

  const { data, count } = await baseQuery.range(from, to)
  const actresses  = (data ?? []) as ActressRow[]
  const total      = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // フォールバック画像
  const fallbackMap = await buildFallbackMap(supabase, actresses)

  // ── デフォルトビュー: ページ内セクション見出し挿入 ─────────────────────────
  type Item = ActressRow | { _header: string }
  const items: Item[] = []
  if (!q && !row) {
    let lastRow = ''
    for (const actress of actresses) {
      const r = getRow(actress.ruby)
      if (r !== lastRow) {
        items.push({ _header: r })
        lastRow = r
      }
      items.push(actress)
    }
  }

  const isFiltered = !!(q || row)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">

      {/* ヘッダー */}
      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold text-[var(--text)]">女優索引</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {q   ? `「${q}」の検索結果 — ${total.toLocaleString()}名`
           : row ? `${row}行 — ${total.toLocaleString()}名`
           : `${total.toLocaleString()}名 登録済み`}
        </p>
      </div>

      {/* 検索 + 50音ナビ */}
      <div className="sticky top-[57px] z-40 -mx-4 px-4 py-2.5 backdrop-blur-md bg-[var(--bg)]/80 border-b border-[var(--border)] space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Suspense fallback={<div className="h-9 w-72 rounded-full bg-[var(--surface)] animate-pulse" />}>
            <SearchInput defaultValue={q} />
          </Suspense>

          {/* フィルタ解除 */}
          {isFiltered && (
            <a
              href="/actresses"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors underline-offset-2 hover:underline"
            >
              ← 全て表示
            </a>
          )}
        </div>

        {/* 50音ナビ（行フィルタ） */}
        <nav aria-label="50音フィルタ" className="flex flex-wrap gap-1">
          {GOJUON.map(({ label }) => {
            const isActive = row === label
            return (
              <a
                key={label}
                href={`/actresses?row=${encodeURIComponent(label)}`}
                className={`
                  inline-flex items-center justify-center rounded-full w-8 h-8 text-xs font-bold
                  border transition-colors
                  ${isActive
                    ? 'border-[var(--magenta)] bg-[var(--magenta)]/15 text-[var(--magenta)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)]'
                  }
                `}
              >
                {label}
              </a>
            )
          })}
        </nav>
      </div>

      {/* グリッド */}
      {actresses.length === 0 ? (
        <p className="py-20 text-center text-sm text-[var(--text-muted)]">
          {q ? `「${q}」に一致する女優が見つかりませんでした` : '女優が見つかりませんでした'}
        </p>
      ) : isFiltered ? (
        // 検索・行フィルタ: フラットグリッド
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {actresses.map(actress => (
            <ActressCard
              key={actress.external_id}
              externalId={actress.external_id}
              name={actress.name}
              ruby={actress.ruby}
              thumbUrl={actressThumb(actress, fallbackMap)}
            />
          ))}
        </div>
      ) : (
        // デフォルト: 50音セクション見出し付きグリッド
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {items.map((item, i) =>
            '_header' in item ? (
              <SectionHeader key={`h-${item._header}-${i}`} label={item._header} />
            ) : (
              <ActressCard
                key={item.external_id}
                externalId={item.external_id}
                name={item.name}
                ruby={item.ruby}
                thumbUrl={actressThumb(item, fallbackMap)}
              />
            )
          )}
        </div>
      )}

      {/* ページネーション */}
      <Suspense>
        <Pagination currentPage={page} totalPages={totalPages} />
      </Suspense>

    </div>
  )
}

// ── セクション見出し（グリッド内 col-span-full） ───────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="col-span-full flex items-center gap-3 pt-6 pb-1">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--magenta)]/15 text-xs font-bold text-[var(--magenta)] shrink-0">
        {label}
      </span>
      <span className="text-sm font-bold text-[var(--text)]">{label}行</span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  )
}
