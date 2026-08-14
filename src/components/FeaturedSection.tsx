import { Star } from 'lucide-react'
import { getFeaturedActressCards } from '@/lib/featuredActressScoring'
import { ArticleCard } from './ArticleCard'
import type { Article } from '@/lib/types'

export async function FeaturedSection() {
  // 掲載対象（女優一覧）は編集部が featuredCids.ts の FEATURED_ACTRESSES で固定管理する。
  // ここで自動化しているのは「各女優の代表作品をDBから解決」「表示順をスコアで決定」の2点のみ。
  // 詳細: src/lib/featuredActressScoring.ts
  const cards = await getFeaturedActressCards()
  const articles: Article[] = cards.map(c => c.article)

  if (articles.length === 0) return null

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Star size={17} className="fill-amber-400 text-amber-400" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            VERITYオススメ女優
          </h2>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400">
            厳選 {articles.length}作
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          VERITYが自信をもってオススメしたい女優の最新作をピックアップして紹介！
        </p>
      </div>

      {/* Grid — pt-3 makes room for the PICK badge that floats above each card */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 pt-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {articles.map(article => (
          <div key={article.external_id ?? article.id} className="relative">
            {/* PICK badge — sits above the card's top edge */}
            <span className="absolute -top-2.5 left-3 z-10 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-black shadow-[0_2px_8px_rgba(245,158,11,0.45)]">
              VERITY PICK
            </span>
            {/* Gold ring wrapper */}
            <div className="rounded-xl ring-2 ring-amber-500/40 ring-offset-1 ring-offset-[var(--bg)] transition-all duration-200 hover:ring-amber-400/70 hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]">
              <ArticleCard article={article} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
