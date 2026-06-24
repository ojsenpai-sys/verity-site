'use client'

import { useEffect, useState } from 'react'
import { Flame, Lock, ExternalLink, Tag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'

// ── 20タイトルデータ ────────────────────────────────────────────────────────────
type SaleItem = {
  cid:      string
  actress?: string
  title?:   string
  cover?:   'jp' | 'pl'   // 画像実測で jp.jpg 有効時のみ 'jp'。省略時は pl(横長スプレッド)→object-right
}

// ── 2026-06-25 更新 v5: campaign=6565 編集長指定 最新20作品 ──
// 画像実測(2026-06-25): jp.jpg は全20件 now_printing にリダイレクト → 全件 pl で object-right。
const SALE_ITEMS: SaleItem[] = [
  { cid: 'sone00874',   actress: '夢乃あいか' },
  { cid: 'hmn00714',    actress: '東條なつ' },
  { cid: 'sone00765',   actress: '浅野こころ' },
  { cid: 'hndb00266',   actress: '五日市芽依' },
  { cid: 'sone00772',   actress: '榊原萌' },
  { cid: 'sone00761',   actress: '鷲尾めい' },
  { cid: 'mkmp00646',   actress: '北岡果林' },
  { cid: 'mkmp00644',   actress: '逢沢みゆ' },
  { cid: 'sone00768',   actress: '渚あいり' },
  { cid: 'sone00877',   actress: '東実果' },
  { cid: 'sone00787',   actress: '木村愛心' },
  { cid: 'hmn00707',    actress: '七瀬アリス' },
  { cid: 'sone00563',   actress: '本郷愛' },
  { cid: 'sivr00418',   actress: '田野憂' },
  { cid: 'sone00763',   actress: '河北彩花（河北彩伽）' },
  { cid: 'cjod00468',   actress: '天月あず' },
  { cid: 'sivr00421',   actress: '兒玉七海' },
  { cid: 'mkmp00647',   actress: '五芭' },
  { cid: 'urvrsp00462', actress: '逢沢みゆ' },
  { cid: 'jur00367',    actress: '竹内有紀' },
]

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

// ── 多言語テキスト ──────────────────────────────────────────────────────────────
const MORE_SALE_URL = 'https://video.dmm.co.jp/av/list/?campaign=6565&sort=suggest'

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

function SaleImage({ cid, size, alt }: { cid: string; size: 'jp' | 'pl'; alt: string }) {
  // 単一チョークポイント coverPosClass で表紙位置を決定。
  // 実測(2026-06-25)で本セールCIDは全件 jp.jpg 不在(→now_printing)のため pl(横長スプレッド)配信で
  // object-right。将来 jp.jpg が有効な作品は item.cover='jp' を渡せば object-center に自動切替。
  const coverUrl   = cidToCdnUrl(cid, size)
  const candidates = [proxyUrl(coverUrl)]

  const [idx, setIdx]       = useState(0)
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
        <SaleImage cid={item.cid} size={item.cover ?? 'pl'} alt={alt} />
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

      {/* 20タイトル カードグリッド */}
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
