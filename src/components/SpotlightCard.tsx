import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProxiedImage } from '@/components/ProxiedImage'
import { isBadImageUrl, toHighResPackageUrl, cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
import { getAllFeatures } from '@/lib/features'
import type { FeatureConfig } from '@/lib/features'
import type { Article } from '@/lib/types'

async function getLatestArticleForTag(tag: string): Promise<Article | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, published_at, slug')
    .eq('is_active', true)
    .contains('tags', [tag])
    .order('published_at', { ascending: false })
    .limit(1)
    .single()
  return (data as Article | null) ?? null
}

async function getArticleByCid(cid: string): Promise<Article | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, published_at, slug')
    .eq('is_active', true)
    .eq('external_id', cid)
    .limit(1)
    .single()
  return (data as Article | null) ?? null
}

function proxiedJacket(article: Article): string {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
}

// ── 単一カードの描画（同期コンポーネント） ────────────────────────────────────

function SingleCard({ feature, article }: { feature: FeatureConfig; article: Article | null }) {
  return (
    <Link
      href={`/verity/features/${feature.slug}`}
      className="group relative flex h-52 sm:h-60 w-full overflow-hidden rounded-2xl border border-[#d4af37]/25 bg-[#0a0800] transition-all duration-300 hover:border-[#d4af37]/60 hover:shadow-[0_0_40px_rgba(212,175,55,0.22)]"
    >
      {/* 背景画像 */}
      {article && (
        <div className="absolute inset-0">
          <ProxiedImage
            src={proxiedJacket(article)}
            alt={feature.actressName}
            className={`h-full w-full object-cover ${coverPosClass(article.image_url)} opacity-35 transition-transform duration-500 group-hover:scale-105`}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(105deg, rgba(10,8,0,0.97) 35%, rgba(10,8,0,0.60) 70%, transparent 100%)',
            }}
          />
        </div>
      )}

      {/* グロー */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 0% 50%, rgba(212,175,55,0.12) 0%, transparent 70%)',
        }}
      />

      {/* テキストコンテンツ */}
      <div className="relative flex flex-col justify-center gap-3 px-6 py-6 max-w-sm">
        <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-[#d4af37]">
          <Sparkles size={10} />
          {feature.seriesLabel}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-bold tracking-widest text-[#d4af37]/60 uppercase">
            Actress Feature
          </p>
          <h3
            className="text-2xl sm:text-3xl font-black tracking-tight text-[#d4af37]"
            style={{ textShadow: '0 0 32px rgba(212,175,55,0.45)' }}
          >
            {feature.actressName}
          </h3>
        </div>

        <p className="text-[12px] leading-relaxed text-white/55 line-clamp-2">
          {feature.tagline}
        </p>

        <span className="inline-flex items-center gap-1 self-start text-[11px] font-bold text-[#d4af37]/70 transition-colors group-hover:text-[#d4af37]">
          特集を読む →
        </span>
      </div>
    </Link>
  )
}

// ── 公開コンポーネント — 最新2件を上下2連で表示 ───────────────────────────────

export async function SpotlightCard() {
  const features = getAllFeatures()
  if (!features.length) return null

  const top2 = features.slice(0, 2)

  const articles = await Promise.all(
    top2.map((f) =>
      f.heroCid ? getArticleByCid(f.heroCid) : getLatestArticleForTag(f.actressTag),
    ),
  )

  return (
    <div className="space-y-4">
      {top2.map((feature, i) => (
        <SingleCard key={feature.slug} feature={feature} article={articles[i]} />
      ))}
    </div>
  )
}
