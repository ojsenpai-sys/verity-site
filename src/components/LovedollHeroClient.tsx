'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LovedollProductImage } from '@/components/lovedoll/LovedollProductImage'
import type { LovedollProduct } from '@/lib/lovedoll/getProducts'

// LOVE DOLL特集 トップページHero。
// 画像は list/small のみ（largeなし・低解像度）のため、1枚を全幅に引き伸ばさず
// 3体をコラージュ配置することで解像度不足をレイアウトで吸収する。
// CTAは /verity/lovedoll への内部遷移のみ（fanza_click は発火しない＝新規event_nameを追加しないため）。
// 実際のFANZA遷移計測(position=lovedoll_product / lovedoll_cta)は特集ページ本体で行う。

export function LovedollHeroClient({ products }: { products: LovedollProduct[] }) {
  const [a, b, c] = products

  return (
    <section
      aria-label="LOVE DOLL"
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #0a0a0d 0%, #14101a 45%, #0d0a10 100%)',
        border: '1px solid rgba(197,160,89,0.35)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(197,160,89,0.6), transparent)' }}
      />

      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-8">
        {/* ── コピー ── */}
        <div className="space-y-4">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.15em] uppercase"
            style={{ background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.35)', color: '#c5a059' }}
          >
            SPECIAL COLLABORATION
          </span>

          <div className="space-y-1">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight" style={{ color: '#f0f0f8' }}>
              LOVE DOLL
            </h2>
            <p className="text-sm font-bold tracking-[0.2em]" style={{ color: '#c5a059' }}>
              REALITY, REDEFINED.
            </p>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: 'rgba(240,240,248,0.72)' }}>
            オリエント工業をはじめとする実力メーカーが手がける、精巧なラブドールたち。
            VERITYが厳選した特別なラインナップを特集ページでご紹介します。
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <Link
              href="/verity/lovedoll"
              className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full px-6 py-3 text-sm font-black tracking-wide transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
              style={{ background: '#c5a059', color: '#0a0a0d' }}
            >
              LOVE DOLL特集を見る
              <ArrowRight size={16} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <p className="text-[10px]" style={{ color: 'rgba(197,160,89,0.45)' }}>
            ※本セクションはアフィリエイトリンクを含むプロモーションです
          </p>
        </div>

        {/* ── 3体コラージュ ── */}
        <div className="relative mx-auto grid h-56 w-full max-w-sm grid-cols-3 items-end gap-2 sm:h-64">
          {[a, b, c].map((p, i) =>
            p ? (
              <div
                key={p.cid}
                className="relative overflow-hidden rounded-xl bg-[var(--surface-2)]"
                style={{
                  height: i === 1 ? '100%' : '82%',
                  border: '1px solid rgba(197,160,89,0.25)',
                }}
              >
                <LovedollProductImage src={p.imageList} alt={p.actress[0] ?? p.title} />
              </div>
            ) : (
              <div key={i} />
            ),
          )}
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(197,160,89,0.4), transparent)' }}
      />
    </section>
  )
}
