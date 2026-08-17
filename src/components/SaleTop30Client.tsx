'use client'

import { useEffect, useState } from 'react'
import { Flame, Lock, ExternalLink, Tag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'
import type { SaleTop30Item } from '@/lib/sale/top30'

// VERITY SALE TOP30 — 常設セクション（旧 Fanza100SaleBanner / FanzaChijoSaleBanner を統合）。
// データは Server Component 側(SaleTop30Section)が sale_top30_snapshots から取得して props で渡す。
// Analytics: 既存 fanza_click を再利用。position='sale_top30'(カード) / 'sale_top30_cta'(一覧CTA)。新event_nameは追加しない。

const LANDING_URL = 'https://video.dmm.co.jp/av/list/?campaign=all&sort=suggest'
const CTA_TARGET_ID = 'sale_top30_all' // 一覧CTAは特定CIDを持たないためsentinel値を使う（他のfanza_click同様 target_id列は自由文字列）

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

function formatYen(n: number | null): string | null {
  if (n == null) return null
  return `¥${n.toLocaleString('ja-JP')}`
}

const TEXTS = {
  ja: {
    badge: 'FANZA SALE',
    tag: '開催中セール',
    title: 'FANZA SALE',
    sub: '開催中のセール作品から VERITY 注目の30作品をピックアップ',
    lock: '会員登録で完全リストを見る',
    pr: '※本セクションはアフィリエイトリンクを含むプロモーションです',
    viewBtn: 'FANZAで観る',
    moreBtn: '🔥 FANZAですべてのセール作品を見る',
  },
  en: {
    badge: 'FANZA SALE',
    tag: 'Live Sale',
    title: 'FANZA SALE',
    sub: "VERITY's picks — 30 standout titles from FANZA's currently running sales",
    lock: 'Register free to see the full list',
    pr: '* This section contains affiliate / promotional links.',
    viewBtn: 'Watch on FANZA',
    moreBtn: '🔥 View All Sale Titles on FANZA',
  },
  th: {
    badge: 'FANZA SALE',
    tag: 'กำลังเซลล์',
    title: 'FANZA SALE',
    sub: 'VERITY คัดสรร 30 ผลงานเด่นจากเซลล์ที่กำลังจัดอยู่บน FANZA',
    lock: 'สมัครสมาชิกฟรีเพื่อดูรายการเต็ม',
    pr: '* ส่วนนี้มีลิงก์พันธมิตร (affiliate)',
    viewBtn: 'ดูบน FANZA',
    moreBtn: '🔥 ดูผลงานเซลล์ทั้งหมดบน FANZA',
  },
} as const

type Lang = keyof typeof TEXTS

function SaleImage({ cid, alt }: { cid: string; alt: string }) {
  const coverUrl = cidToCdnUrl(cid, 'pl')
  const candidates = [proxyUrl(coverUrl)]
  const [idx, setIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  if (failed) return <NowPrinting />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[idx]}
      alt={alt}
      className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(coverUrl)} transition-transform duration-200 group-hover:scale-105`}
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1)
        else setFailed(true)
      }}
    />
  )
}

function SaleTop30Card({ item, isAuthed, viewLabel, onLock }: { item: SaleTop30Item; isAuthed: boolean; viewLabel: string; onLock: () => void }) {
  const dmmHref = withAffiliate(dmmUrl(item.cid)) ?? dmmUrl(item.cid)
  const alt = item.actress ? `${item.actress}${item.title ? `「${item.title}」` : ''}` : (item.title ?? item.cid)
  const salePrice = formatYen(item.price)
  const regularPrice = formatYen(item.listPrice)

  function handleCtaClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isAuthed) {
      e.preventDefault()
      onLock()
    }
  }

  return (
    <article className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(251,191,36,0.12)] hover:-translate-y-0.5">
      <FanzaLink
        href={dmmHref}
        targetId={item.cid}
        position="sale_top30"
        meta={{ rank: item.rank }}
        className="relative block w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
      >
        <SaleImage cid={item.cid} alt={alt} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />

        {item.discountPct != null && item.discountPct > 0 && (
          <span
            className="absolute left-0 top-3 rounded-r-full px-3 py-0.5 text-[10px] font-black text-white shadow-md"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
          >
            {item.discountPct}% OFF
          </span>
        )}

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.15)' }} />
      </FanzaLink>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {item.actress && (
          <p className="text-[11px] font-semibold text-[var(--magenta)] line-clamp-1">{item.actress}</p>
        )}
        {item.title && (
          <h3 className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-snug">{item.title}</h3>
        )}
        {(salePrice || regularPrice) && (
          <p className="text-[11px] text-[var(--text-secondary,#888)]">
            {salePrice && <span className="font-bold text-amber-500">{salePrice}</span>}
            {regularPrice && salePrice !== regularPrice && (
              <span className="ml-1.5 line-through opacity-60">{regularPrice}</span>
            )}
          </p>
        )}

        <a
          href={dmmHref}
          target={isAuthed ? '_blank' : undefined}
          rel="noopener noreferrer sponsored"
          onClick={handleCtaClick}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
        >
          {isAuthed ? (
            <>
              <ExternalLink size={10} className="shrink-0" />
              {viewLabel}
            </>
          ) : (
            <>
              <Lock size={10} className="shrink-0" />
              登録して観る
            </>
          )}
        </a>
      </div>
    </article>
  )
}

export function SaleTop30Client({ items }: { items: SaleTop30Item[] }) {
  const { user } = useAuth()
  const [lang, setLang] = useState<Lang>('ja')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const bl = navigator.language.toLowerCase()
    if (bl.startsWith('th')) setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else setLang('ja')
  }, [])

  if (!mounted || items.length === 0) return null

  const t = TEXTS[lang]
  const isAuthed = !!user
  const ctaHref = withAffiliate(LANDING_URL) ?? LANDING_URL

  function fireLock() {
    window.dispatchEvent(new CustomEvent('verity:auth-required', { detail: { ctx: 'sale' } }))
  }

  return (
    <section
      aria-label="FANZA SALE"
      className="relative overflow-hidden rounded-2xl space-y-5"
      style={{
        background: 'linear-gradient(135deg, #1c1000 0%, #201500 40%, #1a0c00 100%)',
        border: '1px solid rgba(251,191,36,0.35)',
        padding: '1.25rem 1.25rem 1.5rem',
      }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.6), rgba(234,88,12,0.4), transparent)' }} />

      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
          style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24' }}
        >
          <Flame size={10} className="shrink-0" />
          {t.badge}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-black"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff' }}
        >
          <Tag size={10} className="shrink-0" />
          {t.tag}
        </span>
        <span className="text-[10px] text-amber-500/60 ml-auto">PR</span>
      </div>

      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight" style={{ color: '#fbbf24' }}>
          {t.title}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(251,191,36,0.8)' }}>
          {t.sub}
        </p>
      </div>

      {/* 30作品 — モバイル: 横スワイプレーン(FanzaChijoSaleBanner方式) / sm+: 5列グリッド */}
      <div className="-mx-5 px-5 sm:mx-0 sm:px-0">
        <div
          className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory
                      [scrollbar-width:none] [-ms-overflow-style:none]
                      [&::-webkit-scrollbar]:hidden
                      sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:pb-0
                      md:grid-cols-4 lg:grid-cols-5"
        >
          {items.map((item) => (
            <div key={item.cid} className="w-[44vw] max-w-[180px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink">
              <SaleTop30Card item={item} isAuthed={isAuthed} viewLabel={t.viewBtn} onLock={fireLock} />
            </div>
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] tracking-widest text-amber-500/40 sm:hidden">
          ← スワイプして全{items.length}作品を見る →
        </p>
      </div>

      <div className="flex justify-center pt-2">
        <FanzaLink
          href={ctaHref}
          targetId={CTA_TARGET_ID}
          position="sale_top30_cta"
          className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full
                     px-8 py-3.5 text-sm font-black tracking-wide transition-all duration-300
                     hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(197,160,89,0.5)]
                     active:scale-95"
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: '#0a0a0a', border: '1px solid #c5a059' }}
          />
          <span
            className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(197,160,89,0.15) 0%, rgba(197,160,89,0.05) 100%)' }}
          />
          <span
            className="absolute inset-x-0 top-0 h-px opacity-60 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: 'linear-gradient(90deg, transparent, #c5a059, transparent)' }}
          />
          <span className="relative z-10" style={{ color: '#c5a059' }}>{t.moreBtn}</span>
          <ExternalLink size={14} className="relative z-10 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ color: '#c5a059' }} />
        </FanzaLink>
      </div>

      <p className="text-[10px]" style={{ color: 'rgba(251,191,36,0.4)' }}>
        {t.pr}
      </p>

      <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(234,88,12,0.4), transparent)' }} />
    </section>
  )
}
