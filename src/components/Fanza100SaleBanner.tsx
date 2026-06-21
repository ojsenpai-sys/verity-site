'use client'

import { useEffect, useState } from 'react'
import { Flame, Lock, ExternalLink, Tag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { cidToCdnUrl } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'

// ── 15タイトルデータ ────────────────────────────────────────────────────────────
type SaleItem = {
  cid:     string
  actress: string
  title?:  string
}

// ── 2026-06-17 更新 v4: campaign=6565 編集長指定最新15作品 ──
const SALE_ITEMS: SaleItem[] = [
  { cid: 'sqte00614',    actress: '天馬ゆい' },
  { cid: 'mikr00016',   actress: '白岩冬萌' },
  { cid: 'mida00194',   actress: 'Himari' },
  { cid: 'mfyd00011',   actress: '佐山愛' },
  { cid: 'ebwh00223',   actress: '七瀬アリス' },
  { cid: 'mvsd00645',   actress: '根尾あかり' },
  { cid: 'mih00018',    actress: '松本いちか' },
  { cid: 'mngs00002',   actress: '新井リマ' },
  { cid: 'mngs00004',   actress: '美園和花' },
  { cid: 'pppe00345',   actress: '逢沢みゆ' },
  { cid: 'hmn00699',    actress: '五日市芽依' },
  { cid: 'mida00204',   actress: '三木環奈' },
  { cid: 'pred00777',   actress: '三好佑香' },
  { cid: 'urvrsp00451', actress: '小野坂ゆいか' },
  { cid: 'mikr00023',   actress: '森日向子' },
]

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

// ── 多言語テキスト ──────────────────────────────────────────────────────────────
const MORE_SALE_URL = 'https://video.dmm.co.jp/av/list/?campaign=6565&sort=review_rank'

const TEXTS = {
  ja: {
    badge:   '期間限定セール',
    tag:     'キャンペーン中',
    title:   'FANZA 期間限定セール特集',
    sub:     '大手エンタメプラットフォームで現在実施中！人気女優・話題作が期間限定の特別価格でラインナップ！',
    cta:     '対象作品をすべてチェック →',
    lock:    '会員登録で完全リストを見る',
    pr:      '※本バナーはアフィリエイトリンクを含むプロモーションです',
    viewBtn: 'FANZAで観る',
    moreBtn: '🔥 セール対象作品をもっと見る',
  },
  en: {
    badge:   'Limited-time Sale',
    tag:     'Campaign On',
    title:   'FANZA Limited-time Sale',
    sub:     "Now running on a major Japanese entertainment platform! Popular actresses and trending titles at special campaign prices!",
    cta:     'View All Eligible Titles →',
    lock:    'Register free to see the full list',
    pr:      '* This banner contains affiliate / promotional links.',
    viewBtn: 'Watch on FANZA',
    moreBtn: '🔥 View More Sale Titles',
  },
  th: {
    badge:   'เซลล์ช่วงเวลาจำกัด',
    tag:     'แคมเปญ',
    title:   'FANZA เซลล์ช่วงเวลาจำกัด',
    sub:     'กำลังจัดอยู่ตอนนี้! นักแสดงยอดนิยมและผลงานที่กำลังมาแรงในราคาพิเศษ!',
    cta:     'ดูผลงานทั้งหมด →',
    lock:    'สมัครสมาชิกฟรีเพื่อดูรายการเต็ม',
    pr:      '* แบนเนอร์นี้มีลิงก์พันธมิตร (affiliate)',
    viewBtn: 'ดูบน FANZA',
    moreBtn: '🔥 ดูผลงานเซลล์ทั้งหมด',
  },
} as const

type Lang = keyof typeof TEXTS

// ── 各タイトルカード ────────────────────────────────────────────────────────────
type CardProps = {
  item:      SaleItem
  isAuthed:  boolean
  viewLabel: string
  onLock:    () => void
}

function SaleImage({ cid, alt }: { cid: string; alt: string }) {
  const candidates = [
    proxyUrl(cidToCdnUrl(cid, 'pl')),
  ]

  const [idx, setIdx]       = useState(0)
  const [failed, setFailed] = useState(false)

  if (failed) return <NowPrinting />

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[idx]}
      alt={alt}
      className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-200 group-hover:scale-105"
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1)
        else setFailed(true)
      }}
    />
  )
}

function SaleCard({ item, isAuthed, viewLabel, onLock }: CardProps) {
  const dmmHref = withAffiliate(dmmUrl(item.cid)) ?? dmmUrl(item.cid)
  const alt     = item.actress
    ? `${item.actress}${item.title ? `「${item.title}」` : ''}`
    : (item.title ?? '')

  function handleCtaClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isAuthed) {
      e.preventDefault()
      onLock()
    }
  }

  return (
    <article className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(251,191,36,0.12)] hover:-translate-y-0.5">
      {/* パッケージ画像 — FanzaLink でラップ、常にFANZA直行 */}
      <FanzaLink
        href={dmmHref}
        targetId={item.cid}
        position="sale_banner"
        className="relative block w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
      >
        <SaleImage cid={item.cid} alt={alt} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />

        {/* セールバッジ */}
        <span
          className="absolute left-0 top-3 rounded-r-full px-3 py-0.5 text-[10px] font-black text-white shadow-md"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
        >
          セール中
        </span>

        {/* ホバーオーバーレイ（1.05倍ズーム補助） */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.15)' }} />
      </FanzaLink>

      {/* テキスト情報 */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {item.actress && (
          <p className="text-[11px] font-semibold text-[var(--magenta)] line-clamp-1">
            {item.actress}
          </p>
        )}
        {item.title && (
          <h3 className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-snug">
            {item.title}
          </h3>
        )}

        {/* CTA */}
        <a
          href={dmmHref}
          target={isAuthed ? '_blank' : undefined}
          rel="noopener noreferrer sponsored"
          onClick={handleCtaClick}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-bold text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
        >
          {isAuthed ? (
            <><ExternalLink size={10} className="shrink-0" />{viewLabel}</>
          ) : (
            <><Lock size={10} className="shrink-0" />登録して観る</>
          )}
        </a>
      </div>
    </article>
  )
}

// ── メインバナーコンポーネント ──────────────────────────────────────────────────
export function Fanza100SaleBanner() {
  const { user }              = useAuth()
  const [lang, setLang]       = useState<Lang>('ja')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const bl = navigator.language.toLowerCase()
    if (bl.startsWith('th'))      setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else                          setLang('ja')
  }, [])

  if (!mounted) return null

  const t            = TEXTS[lang]
  const isAuthed     = !!user
  const moreSaleHref = withAffiliate(MORE_SALE_URL) ?? MORE_SALE_URL

  function fireLock() {
    window.dispatchEvent(new CustomEvent('verity:auth-required', { detail: { ctx: 'sale' } }))
  }

  return (
    <section
      id="fanza-sale"
      aria-label="FANZA 期間限定セール特集"
      className="relative overflow-hidden rounded-2xl space-y-5"
      style={{
        background: 'linear-gradient(135deg, #1c1000 0%, #201500 40%, #1a0c00 100%)',
        border:     '1px solid rgba(251,191,36,0.35)',
        padding:    '1.25rem 1.25rem 1.5rem',
      }}
    >
      {/* 上グロー */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.6), rgba(234,88,12,0.4), transparent)' }}
      />

      {/* ヘッダー */}
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

      {/* タイトル ＋ 説明文 */}
      <div className="space-y-1.5">
        <h2
          className="text-xl sm:text-2xl font-black tracking-tight leading-tight"
          style={{ color: '#fbbf24' }}
        >
          {t.title}
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(251,191,36,0.8)' }}>
          {t.sub}
        </p>
      </div>

      {/* 15タイトル カードグリッド */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {SALE_ITEMS.map((item) => (
          <SaleCard
            key={item.cid}
            item={item}
            isAuthed={isAuthed}
            viewLabel={t.viewBtn}
            onLock={fireLock}
          />
        ))}
      </div>

      {/* セール総合ページ プレミアムリンクボタン */}
      <div className="flex justify-center pt-2">
        <a
          href={moreSaleHref}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full
                     px-8 py-3.5 text-sm font-black tracking-wide transition-all duration-300
                     hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(197,160,89,0.5)]
                     active:scale-95"
          style={{
            background: '#0a0a0a',
            border:     '1px solid #c5a059',
            color:      '#c5a059',
          }}
        >
          {/* ホバー時ゴールドグラデーション背景 */}
          <span
            className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(197,160,89,0.15) 0%, rgba(197,160,89,0.05) 100%)' }}
          />
          {/* 上ラインゴールドグロー */}
          <span
            className="absolute inset-x-0 top-0 h-px opacity-60 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: 'linear-gradient(90deg, transparent, #c5a059, transparent)' }}
          />
          <span className="relative z-10">{t.moreBtn}</span>
          <ExternalLink
            size={14}
            className="relative z-10 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </a>
      </div>

      {/* PR 表示 */}
      <p className="text-[10px]" style={{ color: 'rgba(251,191,36,0.4)' }}>
        {t.pr}
      </p>

      {/* 下グロー */}
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(234,88,12,0.4), transparent)' }}
      />
    </section>
  )
}
