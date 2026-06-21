import Link from 'next/link'
import { ExternalLink, Heart, Star, CalendarDays, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl } from '@/lib/cidUtils'
import type { Article } from '@/lib/types'

async function getMINAMOArticles(): Promise<Article[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, metadata, published_at')
    .eq('is_active', true)
    .contains('tags', ['MINAMO'])
    .order('published_at', { ascending: false })
    .limit(200)
  if (error) console.error('[minamo-banner]', error.message)
  return (data as Article[]) ?? []
}

function getTodayPick(articles: Article[]): Article | null {
  if (!articles.length) return null
  const now = new Date()
  const seed =
    now.getFullYear() * 10000 +
    (now.getMonth() + 1) * 100 +
    now.getDate()
  return articles[seed % articles.length]
}

function getProxiedImage(article: Article): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  const cid = article.external_id as string | null
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

function getAffiliateUrl(article: Article): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string'
      ? article.metadata.url
      : null
  return withAffiliate(raw)
}

// ── ゴールドセパレーター ──────────────────────────────────────────────────────
function GoldDivider({ opacity = '0.18' }: { opacity?: string }) {
  return (
    <div
      className="h-px w-full"
      style={{
        background: `linear-gradient(to right, transparent, rgba(212,175,55,${opacity}), rgba(212,175,55,${opacity}), transparent)`,
      }}
    />
  )
}

// ── メインコンポーネント ─────────────────────────────────────────────────────
export async function MinamoMemorialBanner() {
  const articles = await getMINAMOArticles()
  const pick = getTodayPick(articles)
  const imgSrc = pick ? getProxiedImage(pick) : null
  const fanzaUrl = pick ? getAffiliateUrl(pick) : null

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#d4af37]/35"
      style={{
        background: 'linear-gradient(175deg, #0d0b01 0%, #0a0800 40%, #080700 100%)',
        boxShadow: '0 0 60px rgba(212,175,55,0.1), inset 0 1px 0 rgba(212,175,55,0.15)',
      }}
    >
      {/* ── 最上部ゴールドライン ── */}
      <div
        className="h-[1.5px] w-full"
        style={{
          background:
            'linear-gradient(to right, transparent 0%, rgba(212,175,55,0.3) 20%, #d4af37 50%, rgba(212,175,55,0.3) 80%, transparent 100%)',
        }}
      />

      {/* ════════════════════════════════════════════════════
          ① ヘッダーエリア
          ════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden px-5 pt-6 pb-5 sm:px-8 sm:pt-7 sm:pb-6 text-center">
        {/* 放射グロー背景 */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 90% 120% at 50% -20%, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.04) 55%, transparent 80%)',
          }}
        />

        {/* 左右デコレーションライン */}
        <div
          className="pointer-events-none absolute left-0 top-0 h-full w-24 opacity-30"
          aria-hidden
          style={{ background: 'linear-gradient(to right, rgba(212,175,55,0.12), transparent)' }}
        />
        <div
          className="pointer-events-none absolute right-0 top-0 h-full w-24 opacity-30"
          aria-hidden
          style={{ background: 'linear-gradient(to left, rgba(212,175,55,0.12), transparent)' }}
        />

        {/* 上段: バッジ群 */}
        <div className="relative flex items-center justify-center gap-2 mb-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/45 bg-[#d4af37]/10 px-3 py-0.5 text-[10px] font-black tracking-[0.2em] uppercase text-[#d4af37]">
            <Heart size={8} style={{ fill: '#d4af37', color: '#d4af37' }} />
            Memorial Special
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-0.5 text-[10px] font-black tracking-wider text-white animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            開催中
          </span>
        </div>

        {/* 英語サブタイトル */}
        <p
          className="relative text-[11px] font-black tracking-[0.35em] uppercase mb-1.5"
          style={{ color: 'rgba(212,175,55,0.65)' }}
        >
          MEMORIAL SPECIAL
        </p>

        {/* メインタイトル */}
        <h2
          className="relative text-xl sm:text-2xl font-black tracking-tight leading-tight"
          style={{
            color: '#d4af37',
            textShadow: '0 0 32px rgba(212,175,55,0.55), 0 0 8px rgba(212,175,55,0.25)',
          }}
        >
          ありがとうMINAMO！特設コーナー
        </h2>

        {/* デコレーションライン + サブコピー */}
        <div className="relative flex items-center justify-center gap-3 mt-3">
          <div
            className="h-px w-12 sm:w-20"
            style={{ background: 'linear-gradient(to right, transparent, rgba(212,175,55,0.4))' }}
          />
          <Star size={10} style={{ fill: 'rgba(212,175,55,0.5)', color: 'rgba(212,175,55,0.5)' }} />
          <p className="text-[10px] text-white/40 font-medium tracking-widest">
            2026年12月引退発表 · 全{articles.length}作品を掲載
          </p>
          <Star size={10} style={{ fill: 'rgba(212,175,55,0.5)', color: 'rgba(212,175,55,0.5)' }} />
          <div
            className="h-px w-12 sm:w-20"
            style={{ background: 'linear-gradient(to left, transparent, rgba(212,175,55,0.4))' }}
          />
        </div>
      </div>

      <GoldDivider opacity="0.22" />

      {/* ════════════════════════════════════════════════════
          ② 日替わり枠「本日のMINAMO作品」
          ════════════════════════════════════════════════════ */}
      {pick ? (
        <div className="px-5 py-5 sm:px-8 sm:py-6">
          {/* セクションラベル */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="h-4 w-0.5 rounded-full"
              style={{ background: 'linear-gradient(to bottom, #d4af37, rgba(212,175,55,0.2))' }}
            />
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em] uppercase"
              style={{ color: 'rgba(212,175,55,0.75)' }}
            >
              <CalendarDays size={10} style={{ color: '#d4af37' }} />
              本日のMINAMO作品
            </span>
          </div>

          {/* 画像 + テキストカード */}
          <div className="flex gap-4 sm:gap-5">

            {/* パッケージ画像 */}
            <div
              className="group relative shrink-0 w-28 sm:w-36 overflow-hidden rounded-xl"
              style={{
                border: '1px solid rgba(212,175,55,0.3)',
                boxShadow: '0 0 20px rgba(212,175,55,0.12)',
              }}
            >
              <div className="relative aspect-[2/3] overflow-hidden bg-[#0d0a00]">
                {imgSrc ? (
                  <>
                    <ProxiedImage
                      src={imgSrc}
                      alt={pick.title}
                      className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
                  </>
                ) : (
                  <NowPrinting />
                )}
              </div>
            </div>

            {/* テキスト + ボタン群 */}
            <div className="flex flex-col min-w-0 flex-1">

              {/* 今日の一作バッジ */}
              <span
                className="inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9px] font-black tracking-wider mb-2.5"
                style={{
                  borderColor: 'rgba(212,175,55,0.4)',
                  background: 'rgba(212,175,55,0.1)',
                  color: '#d4af37',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: '#d4af37' }}
                />
                今日の一作
              </span>

              {/* 作品タイトル */}
              <p
                className="text-sm font-bold leading-snug text-white/88 line-clamp-4 flex-1"
                style={{ textShadow: '0 0 10px rgba(212,175,55,0.08)' }}
              >
                {pick.title}
              </p>

              {/* ボタン群 */}
              <div className="flex flex-col gap-2.5 mt-4">
                {fanzaUrl && (
                  <FanzaLink
                    href={fanzaUrl}
                    targetId={pick.external_id}
                    position="minamo_banner_today"
                    className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black text-[#0a0800] transition-all hover:brightness-110 active:scale-[.98] bg-gradient-to-br from-[#b8960c] via-[#d4af37] to-[#c9a227] shadow-[0_0_20px_rgba(212,175,55,0.35)]"
                  >
                    FANZAで観る
                    <ExternalLink size={10} />
                  </FanzaLink>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* フォールバック */
        <div className="flex items-center gap-4 px-5 py-5 sm:px-8">
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-[#d4af37]/50 bg-[#d4af37]/10">
            <Heart size={18} style={{ fill: '#d4af37', color: '#d4af37' }} />
          </div>
          <p className="text-[11px] text-white/45">作品データを読み込み中です</p>
        </div>
      )}

      <GoldDivider opacity="0.22" />

      {/* ════════════════════════════════════════════════════
          ③ フルアーカイブCTA
          ════════════════════════════════════════════════════ */}
      <Link
        href="/verity/special/minamo"
        className="group flex items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-4 transition-all duration-200 hover:bg-[#d4af37]/6"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200 group-hover:shadow-[0_0_14px_rgba(212,175,55,0.4)]"
            style={{
              border: '1px solid rgba(212,175,55,0.4)',
              background: 'rgba(212,175,55,0.1)',
            }}
          >
            <Star size={13} style={{ fill: '#d4af37', color: '#d4af37' }} />
          </div>
          <div className="min-w-0">
            <p
              className="text-sm font-black leading-tight transition-colors group-hover:text-[#e8c547]"
              style={{ color: '#d4af37', textShadow: '0 0 16px rgba(212,175,55,0.2)' }}
            >
              全{articles.length}作品のフルアーカイブを見る
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              MINAMO特設コーナーへ · 引退まで全力応援
            </p>
          </div>
        </div>

        <div
          className="shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-200 group-hover:gap-2"
          style={{
            border: '1px solid rgba(212,175,55,0.35)',
            background: 'rgba(212,175,55,0.08)',
            color: '#d4af37',
          }}
        >
          <span className="hidden sm:inline">特設ページへ</span>
          <ChevronRight size={13} />
        </div>
      </Link>

      {/* 最下部ゴールドライン */}
      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(to right, transparent 0%, rgba(212,175,55,0.15) 50%, transparent 100%)',
        }}
      />
    </div>
  )
}
