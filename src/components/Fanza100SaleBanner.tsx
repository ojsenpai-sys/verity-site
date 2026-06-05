'use client'

import { useEffect, useState } from 'react'
import { Flame, ChevronRight, Tag, Lock } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { withAffiliate } from '@/lib/affiliate'

const SALE_URL = 'https://video.dmm.co.jp/list/?key=100%E5%86%86%E3%82%BB%E3%83%BC%E3%83%AB'

const TEXTS = {
  ja: {
    badge:   '期間限定 · 編集部厳選キュレーション',
    tag:     '100円',
    title:   'FANZA 100円セール大特集',
    sub:     'VERITYが独自にキュレーション。大手エンタメプラットフォームで実施中の異例の超低価格セール対象タイトルを徹底解説。',
    picks:   ['人気女優の話題作が破格値', '動画配信限定タイトル多数', '週替わりラインナップ更新中'],
    cta:     '対象作品ガイドを見る',
    lock:    '会員登録で完全リストをチェック',
    pr:      '※ 本バナーはアフィリエイトリンクを含むプロモーションです',
  },
  en: {
    badge:   'Limited-time · Editor-curated',
    tag:     '¥100',
    title:   'FANZA ¥100 Mega Sale Guide',
    sub:     "VERITY's curated breakdown of the massive discount event running on Japan's top entertainment platform.",
    picks:   ['Top actresses at unbeatable prices', 'Streaming-exclusive titles included', 'Weekly lineup updates'],
    cta:     'View Curated Guide',
    lock:    'Register free to see the full list',
    pr:      '* This banner contains affiliate / promotional links.',
  },
  th: {
    badge:   'ช่วงเวลาจำกัด · คัดสรรโดยบรรณาธิการ',
    tag:     '100 เยน',
    title:   'FANZA เซลล์ 100 เยน คัดสรรพิเศษ',
    sub:     'VERITY คัดเลือกผลงานเด่นจากเซลล์ราคาพิเศษที่หาได้ยากบนแพลตฟอร์มบันเทิงชั้นนำของญี่ปุ่น',
    picks:   ['นักแสดงชั้นนำในราคาพิเศษ', 'ผลงาน Streaming Exclusive', 'อัปเดตทุกสัปดาห์'],
    cta:     'ดูรายการคัดสรร',
    lock:    'สมัครสมาชิกฟรีเพื่อดูรายการเต็ม',
    pr:      '* แบนเนอร์นี้มีลิงก์พันธมิตร (affiliate)',
  },
} as const

type Lang = keyof typeof TEXTS

export function Fanza100SaleBanner() {
  const { user }           = useAuth()
  const [lang, setLang]   = useState<Lang>('ja')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const bl = navigator.language.toLowerCase()
    if (bl.startsWith('th'))      setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else                          setLang('ja')
  }, [])

  if (!mounted) return null

  const t        = TEXTS[lang]
  const saleHref = withAffiliate(SALE_URL) ?? SALE_URL

  function handleCtaClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!user) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('verity:auth-required', { detail: { ctx: 'sale100' } }))
    }
  }

  return (
    <section
      id="fanza-100-sale"
      aria-label="FANZA 100円セール特集"
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #1c1000 0%, #201500 40%, #1a0c00 100%)',
        border:     '1px solid rgba(251,191,36,0.35)',
        boxShadow:  '0 0 40px rgba(251,191,36,0.08)',
      }}
    >
      {/* 上グロー */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.6), rgba(234,88,12,0.4), transparent)' }}
      />

      <div className="p-5 sm:p-6 space-y-4">
        {/* ヘッダー行 */}
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

        {/* タイトル ＋ 本文 */}
        <div className="space-y-2">
          <h2
            className="text-xl sm:text-2xl font-black tracking-tight leading-tight"
            style={{ color: '#fbbf24' }}
          >
            {t.title}
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(251,191,36,0.7)' }}>
            {t.sub}
          </p>
        </div>

        {/* ピックアップポイント */}
        <ul className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
          {t.picks.map((pick) => (
            <li
              key={pick}
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: 'rgba(251,191,36,0.85)' }}
            >
              <span className="h-1 w-1 rounded-full bg-amber-400 shrink-0" />
              {pick}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <a
            href={saleHref}
            target={user ? '_blank' : undefined}
            rel="noopener noreferrer sponsored"
            onClick={handleCtaClick}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
              color:      '#fff',
              boxShadow:  '0 0 20px rgba(251,191,36,0.3), 0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {user ? (
              <>
                {t.cta}
                <ChevronRight size={14} className="shrink-0" />
              </>
            ) : (
              <>
                <Lock size={13} className="shrink-0" />
                {t.lock}
              </>
            )}
          </a>
        </div>

        {/* PR 表示 */}
        <p className="text-[10px]" style={{ color: 'rgba(251,191,36,0.4)' }}>
          {t.pr}
        </p>
      </div>

      {/* 下グロー */}
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(234,88,12,0.4), transparent)' }}
      />
    </section>
  )
}
