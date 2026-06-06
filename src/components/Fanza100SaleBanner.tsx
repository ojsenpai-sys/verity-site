'use client'

import { useEffect, useState } from 'react'
import { Flame, Lock, ExternalLink, Tag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { NowPrinting } from '@/components/NowPrinting'
import { withAffiliate } from '@/lib/affiliate'
import { cidToCdnUrl } from '@/lib/cidUtils'

// ── 20タイトルデータ ────────────────────────────────────────────────────────────
type SaleItem = {
  cid:     string
  actress: string
  title:   string
}

const SALE_ITEMS: SaleItem[] = [
  // 川越にこ最優先
  { cid: 'sone00258', actress: '川越にこ',        title: '今いちばん抱きたいカラダ' },
  { cid: 'mizd00362', actress: '石川澪・宮下玲奈', title: 'MOODYZ 2022年厳選100タイトル' },
  { cid: 'ebwh00092', actress: '七瀬アリス',       title: '誰もが振り返る高嶺の花が' },
  { cid: 'juq00682',  actress: '神宮寺ナオ',       title: '合鍵をもらった人妻が' },
  { cid: 'jur00258',  actress: '紗弥佳',           title: '隠れIカップの元芸能人' },
  { cid: 'fpre00045', actress: '似鳥日菜',         title: 'オヤジのハメ撮りドキュメント' },
  { cid: 'miab00157', actress: 'AIKA・鳳カレン',   title: 'ウチらと3Pやろうぜ' },
  { cid: 'dass00158', actress: '森沢かな',         title: '友達のお母さんと' },
  { cid: 'hjmo00652', actress: '',                 title: '残酷ミラーゲーム12' },
  { cid: 'hndb00127', actress: '椎名そら',         title: '初コンプリートBEST 12時間' },
]

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

// ── 多言語テキスト ──────────────────────────────────────────────────────────────
const MORE_SALE_URL = 'https://video.dmm.co.jp/list/?key=100%E5%86%86%E3%82%BB%E3%83%BC%E3%83%AB&sort=suggest&i3_ref=sale_100yen_2026_06-banner&dmmref=detail'

const TEXTS = {
  ja: {
    badge:   '期間限定セール',
    tag:     '100円',
    title:   'FANZA 100円セール大特集',
    sub:     '大手エンタメプラットフォームで実施中の異例の超低価格セール対象タイトルはこちら！',
    cta:     '対象作品をすべてチェック →',
    lock:    '会員登録で完全リストを見る',
    pr:      '※本バナーはアフィリエイトリンクを含むプロモーションです',
    viewBtn: 'FANZAで観る',
    moreBtn: 'その他の100円セール対象作品はこちらから（FANZA公式へ）',
  },
  en: {
    badge:   'Limited-time Sale',
    tag:     '¥100',
    title:   'FANZA ¥100 Mega Sale',
    sub:     "Check out the titles eligible for this exceptionally low-price sale now running on a major Japanese entertainment platform!",
    cta:     'View All Eligible Titles →',
    lock:    'Register free to see the full list',
    pr:      '* This banner contains affiliate / promotional links.',
    viewBtn: 'Watch on FANZA',
    moreBtn: 'Browse all ¥100 sale titles on FANZA',
  },
  th: {
    badge:   'เซลล์ช่วงเวลาจำกัด',
    tag:     '100 เยน',
    title:   'FANZA เซลล์ 100 เยน',
    sub:     'ดูผลงานที่ร่วมเซลล์ราคาพิเศษสุดๆ บนแพลตฟอร์มบันเทิงชั้นนำได้เลยที่นี่!',
    cta:     'ดูผลงานทั้งหมด →',
    lock:    'สมัครสมาชิกฟรีเพื่อดูรายการเต็ม',
    pr:      '* แบนเนอร์นี้มีลิงก์พันธมิตร (affiliate)',
    viewBtn: 'ดูบน FANZA',
    moreBtn: 'ดูผลงานเซลล์ 100 เยนทั้งหมดบน FANZA',
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
  const href = withAffiliate(dmmUrl(item.cid)) ?? dmmUrl(item.cid)
  const alt  = item.actress ? `${item.actress}「${item.title}」` : item.title

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!isAuthed) {
      e.preventDefault()
      onLock()
    }
  }

  return (
    <article className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all duration-200 hover:border-amber-500/50 hover:shadow-[0_0_20px_rgba(251,191,36,0.12)] hover:-translate-y-0.5">
      {/* パッケージ画像 */}
      <a
        href={href}
        target={isAuthed ? '_blank' : undefined}
        rel="noopener noreferrer sponsored"
        onClick={handleClick}
        className="relative block w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
      >
        <SaleImage cid={item.cid} alt={alt} />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />

        {/* 100円バッジ */}
        <span
          className="absolute left-0 top-3 rounded-r-full px-3 py-0.5 text-[10px] font-black text-white shadow-md"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}
        >
          100円
        </span>

        {/* 鍵アイコン（未ログイン） */}
        {!isAuthed && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.5)' }}>
            <Lock size={28} className="text-amber-400 drop-shadow-lg" />
          </div>
        )}
      </a>

      {/* テキスト情報 */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {item.actress && (
          <p className="text-[11px] font-semibold text-[var(--magenta)] line-clamp-1">
            {item.actress}
          </p>
        )}
        <h3 className="text-xs font-medium text-[var(--text)] line-clamp-2 leading-snug">
          {item.title}
        </h3>

        {/* CTA */}
        <a
          href={href}
          target={isAuthed ? '_blank' : undefined}
          rel="noopener noreferrer sponsored"
          onClick={handleClick}
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
    window.dispatchEvent(new CustomEvent('verity:auth-required', { detail: { ctx: 'sale100' } }))
  }

  return (
    <section
      id="fanza-100-sale"
      aria-label="FANZA 100円セール特集"
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

      {/* その他の作品リンク */}
      <div className="flex justify-center">
        <a
          href={moreSaleHref}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full
                     px-6 py-3 text-sm font-black text-white transition-all duration-200
                     hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(251,191,36,0.45)]
                     active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 60%, #d97706 100%)',
            border:     '1px solid rgba(251,191,36,0.5)',
          }}
        >
          <span className="relative z-10 tracking-wide">{t.moreBtn}</span>
          <ExternalLink
            size={15}
            className="relative z-10 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
          {/* ホバー時インナーグロー */}
          <span
            className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)' }}
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
