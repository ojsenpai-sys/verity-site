export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { Search, User, Film, ExternalLink, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { FanzaLink } from '@/components/FanzaLink'
import { TopSearchBar } from '@/components/TopSearchBar'
import { withAffiliate } from '@/lib/affiliate'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import type { Article, Actress } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

type PageProps = {
  searchParams: Promise<{ q?: string }>
}

export async function generateMetadata({ searchParams }: PageProps) {
  const { q } = await searchParams
  const title = q ? `「${q}」の検索結果 | VERITY` : '作品検索 | VERITY'
  return {
    title,
    alternates: { canonical: `${BASE}/verity/search${q ? `?q=${encodeURIComponent(q)}` : ''}` },
    robots: { index: false },
  }
}

// ── データ取得 ───────────────────────────────────────────────────────────────

async function searchArticles(q: string): Promise<Article[]> {
  if (!q.trim()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, metadata, published_at, tags, slug')
    .eq('is_active', true)
    .or(`title.ilike.%${q}%,summary.ilike.%${q}%`)
    .order('published_at', { ascending: false })
    .limit(60)
  if (error) console.error('[search] articles error:', error.message)
  return (data as Article[]) ?? []
}

async function searchActresses(q: string): Promise<Actress[]> {
  if (!q.trim()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('actresses')
    .select('id, external_id, name, ruby, image_url, metadata, is_active')
    .or(`name.ilike.%${q}%,ruby.ilike.%${q}%`)
    .order('is_active', { ascending: false }) // 現役女優を優先表示
    .order('name', { ascending: true })
    .limit(8)
  if (error) console.error('[search] actresses error:', error.message)
  return (data as Actress[]) ?? []
}

// ── ユーティリティ ───────────────────────────────────────────────────────────

function getArticleImage(article: Article): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  const cid = article.external_id as string | null
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

function getArticleAffiliateUrl(article: Article): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string'
      ? article.metadata.url
      : null
  return withAffiliate(raw)
}

function getActressThumb(actress: Actress): string | null {
  if (actress.image_url) {
    return `/verity/api/proxy/image?url=${encodeURIComponent(actress.image_url)}`
  }
  const cid = actress.metadata?.latest_cid as string | null | undefined
  if (cid) {
    return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  }
  return null
}

// ── 女優カード ───────────────────────────────────────────────────────────────

function ActressResultCard({ actress }: { actress: Actress }) {
  const thumb = getActressThumb(actress)
  return (
    <Link
      href={`/verity/actresses/${actress.external_id}`}
      className="group flex items-center gap-3 rounded-xl border border-[#d4af37]/18 bg-[#0d0b00] px-3 py-3 transition-all hover:border-[#d4af37]/40 hover:bg-[#d4af37]/6"
    >
      <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded-lg bg-[#0a0800] border border-[#d4af37]/15">
        {thumb ? (
          <ProxiedImage
            src={thumb}
            alt={actress.name}
            className="h-full w-full object-cover object-right"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User size={14} style={{ color: 'rgba(212,175,55,0.3)' }} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-white/90 group-hover:text-[#d4af37] transition-colors truncate">
          {actress.name}
        </p>
        {actress.ruby && (
          <p className="text-[10px] text-[#d4af37]/40 truncate">{actress.ruby}</p>
        )}
      </div>
      <ExternalLink size={11} style={{ color: 'rgba(212,175,55,0.35)' }} className="shrink-0" />
    </Link>
  )
}

// ── 作品カード ───────────────────────────────────────────────────────────────

function ArticleResultCard({ article }: { article: Article }) {
  const imgSrc = getArticleImage(article)
  const fanzaUrl = getArticleAffiliateUrl(article)

  const card = (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[#d4af37]/15 bg-[#0d0b00] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/40 hover:shadow-[0_0_24px_rgba(212,175,55,0.12)]">
      {/* 画像 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#080700]">
        {imgSrc ? (
          <>
            <ProxiedImage
              src={imgSrc}
              alt={article.title}
              className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          </>
        ) : (
          <NowPrinting />
        )}
        {/* ホバーオーバーレイ */}
        {fanzaUrl && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/55 md:flex">
            <span className="scale-95 rounded-full bg-[#d4af37]/90 px-3 py-1 text-[10px] font-bold text-[#0a0800] opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
              ▶ FANZAで観る
            </span>
          </div>
        )}
      </div>

      {/* テキスト */}
      <div className="flex flex-col gap-2 p-3">
        <p className="text-[11px] font-medium leading-snug line-clamp-2 text-white/82 group-hover:text-[#d4af37]/85 transition-colors">
          {article.title}
        </p>

        {/* タグ */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#d4af37]/20 px-1.5 py-0.5 text-[8px] text-[#d4af37]/50"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {fanzaUrl && (
          <FanzaLink
            href={fanzaUrl}
            targetId={article.external_id}
            position="search_result"
            className="mt-1 flex items-center justify-center gap-1 rounded-lg py-2 text-[10px] font-bold text-[#0a0800] bg-gradient-to-r from-[#b8960c] to-[#d4af37] transition-all hover:brightness-110"
          >
            FANZAで観る
            <ExternalLink size={9} />
          </FanzaLink>
        )}
      </div>
    </article>
  )

  return fanzaUrl ? (
    <FanzaLink
      href={fanzaUrl}
      targetId={article.external_id}
      position="search_card_image"
      className="contents"
    >
      {card}
    </FanzaLink>
  ) : card
}

// ── ページ本体 ───────────────────────────────────────────────────────────────

export default async function SearchPage({ searchParams }: PageProps) {
  const { q: rawQ } = await searchParams
  const q = rawQ?.trim() ?? ''

  const [articles, actresses] = q
    ? await Promise.all([searchArticles(q), searchActresses(q)])
    : [[], []]

  const hasResults = articles.length > 0 || actresses.length > 0

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">

        {/* ── ヘッダー ── */}
        <div className="space-y-4">
          <Link
            href="/verity"
            className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[#d4af37] transition-colors"
          >
            <ArrowLeft size={12} />
            トップへ戻る
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10">
              <Search size={16} style={{ color: '#d4af37' }} />
            </div>
            <div>
              <h1 className="text-lg font-black text-[var(--text)]">
                {q ? `「${q}」の検索結果` : '作品・女優を検索'}
              </h1>
              {q && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  女優 {actresses.length}件 · 作品 {articles.length}件
                </p>
              )}
            </div>
          </div>

          {/* 検索バー（再検索用） */}
          <TopSearchBar />
        </div>

        {/* ── 検索前の案内 ── */}
        {!q && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-[var(--text-muted)]">
            <Search size={40} className="opacity-20" />
            <p className="text-sm">上の検索窓にキーワードを入力してください</p>
          </div>
        )}

        {/* ── 結果なし ── */}
        {q && !hasResults && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-[var(--text-muted)]">
            <Film size={40} className="opacity-20" />
            <p className="text-sm">「{q}」に一致する作品・女優が見つかりませんでした</p>
            <Link
              href="/verity"
              className="text-[11px] text-[#d4af37]/60 hover:text-[#d4af37] transition-colors"
            >
              ← トップページへ
            </Link>
          </div>
        )}

        {/* ── 女優ヒット ── */}
        {actresses.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div
                className="h-5 w-0.5 rounded-full"
                style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.1))' }}
              />
              <User size={14} style={{ color: '#d4af37' }} />
              <h2 className="text-sm font-bold text-[#d4af37]">女優</h2>
              <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-0.5 text-[9px] font-bold text-[#d4af37]">
                {actresses.length}件
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {actresses.map((actress) => (
                <ActressResultCard key={actress.id} actress={actress} />
              ))}
            </div>
            <Link
              href={`/verity/actresses?q=${encodeURIComponent(q)}`}
              className="inline-flex items-center gap-1 text-[11px] text-[#d4af37]/55 hover:text-[#d4af37] transition-colors"
            >
              全女優一覧で「{q}」を検索 →
            </Link>
          </section>
        )}

        {/* ── 作品ヒット ── */}
        {articles.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div
                className="h-5 w-0.5 rounded-full"
                style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.1))' }}
              />
              <Film size={14} style={{ color: '#d4af37' }} />
              <h2 className="text-sm font-bold text-[#d4af37]">作品</h2>
              <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-0.5 text-[9px] font-bold text-[#d4af37]">
                {articles.length}件
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {articles.map((article) => (
                <ArticleResultCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
