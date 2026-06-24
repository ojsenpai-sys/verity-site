'use client'

import { useEffect, useState } from 'react'
import { Flame, Lock, ExternalLink, Tag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { cidToCdnUrl, coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from '@/components/FanzaLink'

type SaleItem = {
  cid:      string
  actress?: string
  title?:   string
  cover?:   'jp' | 'pl'   // 画像実測で jp.jpg 有効時のみ 'jp'。省略時は pl(横長スプレッド)→object-right
}

// 痴女・小悪魔50%OFFセール【第3弾】全30作品（2026-06-25 CID差し替え）
// 画像実測(2026-06-25): jp.jpg は全30件 now_printing にリダイレクト → 全件 pl で object-right。
const SALE_ITEMS: SaleItem[] = [
  { cid: 'midv00275', actress: '小野六花' },
  { cid: 'ssis00712', actress: '四宮ありす' },
  { cid: 'midv00228', actress: '宮下玲奈' },
  { cid: 'pppe00224', actress: '楪カレン' },
  { cid: 'pppe00167', actress: '藤森里穂' },
  { cid: 'midv00271', actress: '新ありな' },
  { cid: 'hmn00537',  actress: '七瀬アリス' },
  { cid: 'ssis00680', actress: '夢乃あいか' },
  { cid: 'sone00069', actress: '架乃ゆら' },
  { cid: 'ssis00335', actress: '小宵こなん' },
  { cid: 'midv00276', actress: '中山ふみか' },
  { cid: 'cawd00353', actress: '伊藤舞雪' },
  { cid: 'waaa00319', actress: '斎藤あみり' },
  { cid: 'midv00719', actress: '葵いぶき' },
  { cid: 'ofje00374', actress: 'miru' },
  { cid: 'ssis00905', actress: '小日向みゆう（清原みゆう）' },
  { cid: 'cawd00676', actress: '桜空もも' },
  { cid: 'mide00924', actress: '水卜さくら' },
  { cid: 'mukc00044', actress: '奏音かのん' },
  { cid: 'ssis00281', actress: '小宵こなん' },
  { cid: 'ssis00277', actress: '天音まひな' },
  { cid: 'sone00127', actress: '浅野こころ' },
  { cid: 'sone00223', actress: '倉木華' },
  { cid: 'ssis00842', actress: 'うんぱい' },
  { cid: 'ssis00252', actress: '河北彩花（河北彩伽）' },
  { cid: 'midv00140', actress: '石川澪' },
  { cid: 'mide00983', actress: '七沢みあ' },
  { cid: 'ssis00491', actress: '東雲みれい' },
  { cid: 'midv00186', actress: '石川澪' },
  { cid: 'hmn00368',  actress: '美谷朱音（美谷朱里）' },
]

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

const MORE_SALE_URL = 'https://video.dmm.co.jp/av/list/?campaign=chijokoakuma'

const TEXTS = {
  ja: {
    badge:   '50%OFF セール',
    tag:     '痴女・小悪魔',
    title:   '痴女・小悪魔 50%OFFセール特集',
    sub:     '人気の痴女・小悪魔系タイトルが期間限定で50%OFF！旬の女優・話題作が特別価格でラインナップ！',
    cta:     '対象作品をすべてチェック →',
    lock:    '会員登録で完全リストを見る',
    pr:      '※本バナーはアフィリエイトリンクを含むプロモーションです',
    viewBtn: 'FANZAで観る',
    moreBtn: '🔥 痴女・小悪魔50%OFFのエロ動画一覧をすべて見る',
  },
  en: {
    badge:   '50% OFF Sale',
    tag:     'Chijo / Koakuma',
    title:   'Chijo & Koakuma 50% OFF Sale',
    sub:     'Top titles in the chijo & koakuma genre now at 50% off for a limited time!',
    cta:     'View All Eligible Titles →',
    lock:    'Register free to see the full list',
    pr:      '* This banner contains affiliate / promotional links.',
    viewBtn: 'Watch on FANZA',
    moreBtn: '🔥 View All 50% OFF Titles',
  },
  th: {
    badge:   'ลด 50% ช่วงเวลาจำกัด',
    tag:     'เซลล์พิเศษ',
    title:   'เซลล์ 50% OFF Chijo & Koakuma',
    sub:     'ผลงานยอดนิยมราคาพิเศษ 50% OFF ช่วงเวลาจำกัด!',
    cta:     'ดูผลงานทั้งหมด →',
    lock:    'สมัครสมาชิกฟรีเพื่อดูรายการเต็ม',
    pr:      '* แบนเนอร์นี้มีลิงก์พันธมิตร (affiliate)',
    viewBtn: 'ดูบน FANZA',
    moreBtn: '🔥 ดูผลงานเซลล์ 50% OFF ทั้งหมด',
  },
} as const

type Lang = keyof typeof TEXTS

type CardProps = {
  item:      SaleItem
  isAuthed:  boolean
  viewLabel: string
  onLock:    () => void
}

function SaleImage({ cid, size, alt }: { cid: string; size: 'jp' | 'pl'; alt: string }) {
  // 単一チョークポイント coverPosClass で表紙位置を決定。
  // ※本セールCID群は jp.jpg 不在で pl にフォールバックする（実測 2026-06-25: 30/30 fallback）ため、
  //   jp.jpg化+object-center は背表紙が中央に出て逆効果。pl.jpg のまま coverPosClass→object-right
  //   で「正面の表紙(スプレッド右側)」を表示するのが正。ArticleCard/人気ランキングと同規約。
  //   将来 jp.jpg が有効な作品は item.cover='jp' を渡せば object-center に自動切替。
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
      <FanzaLink
        href={dmmHref}
        targetId={item.cid}
        position="chijo_sale_banner"
        className="relative block w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
      >
        <SaleImage cid={item.cid} size={item.cover ?? 'pl'} alt={alt} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />

        <span
          className="absolute left-0 top-3 rounded-r-full px-3 py-0.5 text-[10px] font-black text-white shadow-md"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
        >
          50%OFF
        </span>

        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.15)' }} />
      </FanzaLink>

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

export function FanzaChijoSaleBanner() {
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
      id="fanza-chijo-sale"
      aria-label="痴女・小悪魔 50%OFFセール特集"
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

      {/* 30タイトル — モバイル: 横スワイプレーン / sm+: グリッド */}
      <div className="-mx-5 px-5 sm:mx-0 sm:px-0">
        <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory
                        [scrollbar-width:none] [-ms-overflow-style:none]
                        [&::-webkit-scrollbar]:hidden
                        sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:pb-0
                        md:grid-cols-4 lg:grid-cols-5">
          {SALE_ITEMS.map((item) => (
            <div
              key={item.cid}
              className="w-[44vw] max-w-[180px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink"
            >
              <SaleCard
                item={item}
                isAuthed={isAuthed}
                viewLabel={t.viewBtn}
                onLock={fireLock}
              />
            </div>
          ))}
        </div>
        {/* モバイル限定: 横スクロールヒント */}
        <p className="mt-1 text-center text-[10px] tracking-widest text-amber-500/40 sm:hidden">
          ← スワイプして全30作品を見る →
        </p>
      </div>

      {/* セール会場リンク */}
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
          <span
            className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(197,160,89,0.15) 0%, rgba(197,160,89,0.05) 100%)' }}
          />
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
