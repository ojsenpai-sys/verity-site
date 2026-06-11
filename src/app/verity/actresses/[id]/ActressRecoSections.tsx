import Link from 'next/link'
import { ExternalLink, Film, Building2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'
import type { Article, Actress } from '@/lib/types'

// ── 型定義 ─────────────────────────────────────────────────
type MakerEntry = { id: number; name: string }
type SlimActress = { external_id: string; name: string; image_url: string | null }

type Props = {
  actress:          Actress
  recentArticles:   Article[]
  makerEntry:       MakerEntry | null
  coStarExtIds:     string[]   // external_id のリスト (dmm-actress-XXXX)
}

// ── ヘルパー ───────────────────────────────────────────────
function proxyUrl(src: string) {
  return `/api/proxy/image?url=${encodeURIComponent(src)}`
}

function isDigitalWork(article: Article): boolean {
  const url = (article.metadata?.url as string) ?? ''
  return url.includes('video.dmm.co.jp') || url.includes('/digital/')
}

function getAffiliateUrl(article: Article): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string'
      ? article.metadata.url as string
      : null
  return withAffiliate(raw)
}

function digitalFirst(articles: Article[]): Article[] {
  const deduped = deduplicateDigitalFirst(articles)
  return [
    ...deduped.filter(isDigitalWork),
    ...deduped.filter(a => !isDigitalWork(a)),
  ]
}

// ── 作品コンパクトカード ────────────────────────────────────
function RecoWorkCard({
  article,
  position,
}: {
  article:  Article
  position: string
}) {
  const url    = getAffiliateUrl(article)
  const imgUrl = article.image_url

  const inner = (
    <>
      {/* サムネイル */}
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
        {imgUrl ? (
          <ProxiedImage
            src={proxyUrl(imgUrl)}
            alt={article.title}
            className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <NowPrinting />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
      </div>

      {/* テキスト & CTA */}
      <div className="p-3 space-y-2">
        <p className="text-[11px] leading-snug line-clamp-2 text-[var(--text)] min-h-[2.75rem]">
          {article.title}
        </p>
        <div className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--magenta)]/15 px-2 py-1.5 text-[11px] font-bold text-[var(--magenta)] group-hover:bg-[var(--magenta)]/30 transition-colors">
          <ExternalLink size={9} />
          FANZAで今すぐ見る
        </div>
      </div>
    </>
  )

  const cls =
    'block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden group ' +
    'hover:border-[var(--magenta)]/70 hover:shadow-[0_0_24px_rgba(226,0,116,0.18)] hover:-translate-y-1 transition-all duration-200'

  return url ? (
    <FanzaLink href={url} targetId={article.external_id} position={position} className={cls}>
      {inner}
    </FanzaLink>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

// ── 関連女優カード ──────────────────────────────────────────
function RelatedActressCard({ actress }: { actress: SlimActress }) {
  return (
    <Link
      href={`/verity/actresses/${actress.external_id}`}
      className="block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden group hover:border-amber-500/60 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] hover:-translate-y-1 transition-all duration-200"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
        {actress.image_url ? (
          <ProxiedImage
            src={proxyUrl(actress.image_url)}
            alt={actress.name}
            className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <NowPrinting />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          <p className="text-xs font-bold text-white drop-shadow-lg line-clamp-1">{actress.name}</p>
          <p className="flex items-center gap-0.5 text-[10px] text-amber-300/80">
            プロフィールを見る <ExternalLink size={8} />
          </p>
        </div>
      </div>
    </Link>
  )
}

// ── セクションヘッダー ──────────────────────────────────────
function RecoHeader({
  icon,
  title,
  subtitle,
  color,
}: {
  icon:     React.ReactNode
  title:    string
  subtitle: string
  color:    string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <h2 className="text-sm font-black tracking-tight" style={{ color }}>
            {title}
          </h2>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-widest"
            style={{
              background: color + '18',
              color,
              border: `1px solid ${color}35`,
            }}
          >
            PR
          </span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  )
}

// ── メインコンポーネント ────────────────────────────────────
export async function ActressRecoSections({
  actress,
  recentArticles,
  makerEntry,
  coStarExtIds,
}: Props) {
  const supabase = await createClient()
  const now      = new Date().toISOString()

  // B & C を並列取得
  const [{ data: makerRaw }, { data: coStarRaw }] = await Promise.all([
    makerEntry
      ? supabase
          .from('articles')
          .select('id, external_id, title, image_url, metadata, published_at, slug, source, category, tags, summary, content, fetched_at, is_active')
          .eq('is_active', true)
          .lte('published_at', now)
          .filter('tags', 'not.cs', `{"${actress.name}"}`)
          .filter('metadata->>maker', 'like', `%"id": ${makerEntry.id}%`)
          .order('published_at', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] as Article[] }),

    coStarExtIds.length > 0
      ? supabase
          .from('actresses')
          .select('external_id, name, image_url')
          .in('external_id', coStarExtIds.slice(0, 16))
          .eq('is_active', true)
          .neq('external_id', actress.external_id)
          .limit(4)
      : Promise.resolve({ data: [] as SlimActress[] }),
  ])

  // ── A: この女優の注目作品（digital 優先 top 4）
  const sectionA = digitalFirst(recentArticles).slice(0, 4)

  // ── B: 同メーカー最新ライン（digital 優先 top 4）
  const sectionB = digitalFirst((makerRaw as Article[] | null) ?? []).slice(0, 4)

  // ── C: 関連女優
  const sectionC = (coStarRaw as SlimActress[] | null) ?? []

  if (sectionA.length === 0 && sectionB.length === 0 && sectionC.length === 0) return null

  return (
    <div className="space-y-10">

      {/* ── セパレータ ──────────────────────────────── */}
      <div className="relative flex items-center gap-4">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
        <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          自動レコメンド
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      </div>

      {/* ── A: この女優の注目作品 ────────────────────── */}
      {sectionA.length > 0 && (
        <section className="space-y-4">
          <RecoHeader
            icon={<Film size={14} color="var(--magenta)" />}
            title={`${actress.name}の注目作品`}
            subtitle="サンプル動画あり・今すぐ無料チェック"
            color="var(--magenta)"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionA.map(a => (
              <RecoWorkCard key={a.id} article={a} position="actress_page_latest" />
            ))}
          </div>
        </section>
      )}

      {/* ── B: 同メーカー最新ラインナップ ──────────── */}
      {sectionB.length > 0 && makerEntry && (
        <section className="space-y-4">
          <RecoHeader
            icon={<Building2 size={14} color="#22ccff" />}
            title={`${makerEntry.name}の最新ラインナップ`}
            subtitle={`${actress.name}と同メーカーのおすすめ作品`}
            color="#22ccff"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionB.map(a => (
              <RecoWorkCard key={a.id} article={a} position="actress_page_maker" />
            ))}
          </div>
        </section>
      )}

      {/* ── C: 関連女優 ──────────────────────────────── */}
      {sectionC.length > 0 && (
        <section className="space-y-4">
          <RecoHeader
            icon={<Sparkles size={14} color="#fbbf24" />}
            title="こちらの女優もオススメ"
            subtitle="共演歴のある女優をチェック"
            color="#fbbf24"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {sectionC.map(a => (
              <RelatedActressCard key={a.external_id} actress={a} />
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
