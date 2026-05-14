'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChevronDown, Database, Globe, Zap, Brain, BookOpen, ArrowRight,
  Shield, Layers, TrendingUp, Award,
} from 'lucide-react'
import type { SnNewsWithActress } from '@/lib/types'

// ── Design tokens ─────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C'
const CREAM = '#f8f5ed'
const MUTED = '#8888aa'
const BG    = '#080810'
const BG2   = '#0d0d1a'
const SERIF = '"YuMincho", "Yu Mincho", "Hiragino Mincho ProN W3", "Hiragino Mincho Pro", Georgia, "Times New Roman", serif'

// ── Scroll-reveal hook ────────────────────────────────────────────────────────
function useReveal(threshold = 0.09) {
  const ref = useRef<HTMLDivElement>(null)
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setOk(true); obs.disconnect() } },
      { threshold },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, ok }
}

function Reveal({ children, delay = 0, className = '', from = 'bottom' }: {
  children: ReactNode; delay?: number; className?: string; from?: 'bottom' | 'left' | 'right'
}) {
  const { ref, ok } = useReveal()
  const init = from === 'left' ? 'translateX(-32px)' : from === 'right' ? 'translateX(32px)' : 'translateY(28px)'
  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: ok ? 1 : 0,
        transform: ok ? 'none' : init,
        transition: 'opacity .85s cubic-bezier(.16,1,.3,1), transform .85s cubic-bezier(.16,1,.3,1)',
        willChange: 'opacity, transform',
      }}
      className={className}
    >
      {children}
    </div>
  )
}

// ── Micro-components ──────────────────────────────────────────────────────────
function GoldLine({ className = '' }: { className?: string }) {
  return (
    <div className={className}
      style={{ height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
  )
}

function SectionTag({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: GOLD, letterSpacing: '0.35em', fontSize: 10, fontWeight: 700 }}
      className="block uppercase mb-4">
      {children}
    </span>
  )
}

function GoldBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="rounded-full px-3 py-1 uppercase text-[9px] font-bold tracking-[0.2em]"
      style={{ border: `1px solid ${GOLD}40`, color: GOLD }}
    >
      {children}
    </span>
  )
}

// ── Browser frame mock ────────────────────────────────────────────────────────
function BrowserFrame({ children, url = 'verity-official.com' }: { children: ReactNode; url?: string }) {
  return (
    <div className="rounded-xl overflow-hidden shadow-2xl"
      style={{ border: `1px solid ${GOLD}30`, background: BG2 }}>
      <div className="flex items-center gap-3 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${GOLD}14`, background: '#0a0a14' }}>
        <div className="flex gap-1.5">
          {['#ff5f57', '#febc2e', '#28c840'].map(c => (
            <div key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="flex-1 rounded px-3 py-1 text-center truncate"
          style={{ background: '#141420', fontSize: 10, color: MUTED }}>
          {url}
        </div>
      </div>
      {children}
    </div>
  )
}

// ── Hero Carousel ─────────────────────────────────────────────────────────────
const HERO_SLIDES = [
  { src: '/assets/lp/VERITY01.jpg', caption: 'ダッシュボード — トップページ全体', url: 'verity-official.com' },
  { src: '/assets/lp/VERITY09.jpg', caption: 'VERITY 人気女優ランキング Top 7', url: 'verity-official.com/#popular-ranking' },
  { src: '/assets/lp/VERITY08.jpg', caption: 'THE MUST ONE — 編集長の一本', url: 'verity-official.com/#the-must-one' },
]

function HeroCarousel() {
  const [cur, setCur] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setCur(c => (c + 1) % HERO_SLIDES.length), 4800)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="w-full">
      <BrowserFrame url={HERO_SLIDES[cur].url}>
        <div className="relative overflow-hidden" style={{ aspectRatio: '16/10' }}>
          {HERO_SLIDES.map((s, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={s.src}
              src={s.src}
              alt={s.caption}
              className="absolute inset-0 w-full h-full object-cover object-top"
              style={{ opacity: i === cur ? 1 : 0, transition: 'opacity 1.1s cubic-bezier(.16,1,.3,1)' }}
            />
          ))}
        </div>
      </BrowserFrame>
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {HERO_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCur(i)}
            className="rounded-full transition-all duration-400"
            style={{ width: i === cur ? 22 : 6, height: 6, background: i === cur ? GOLD : `${GOLD}32` }}
          />
        ))}
      </div>
      <p className="text-center mt-2 text-[10px] tracking-[0.1em]" style={{ color: MUTED }}>
        {HERO_SLIDES[cur].caption}
      </p>
    </div>
  )
}

// ── Demo news card ─────────────────────────────────────────────────────────────
function DemoNewsCard({ news }: { news: SnNewsWithActress }) {
  const proxy = (url: string) => `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
  const href  = `/verity/news/${news.slug}`

  return (
    <article className="flex flex-col rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{ border: `1px solid ${GOLD}22`, background: BG2 }}>
      {/* pl.jpg は横長 3:2 */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '3/2', background: '#1a1a26' }}>
        {news.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxy(news.thumbnail_url)} alt={news.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span style={{ color: MUTED, fontSize: 11 }}>No Image</span>
          </div>
        )}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #0d0d1acc 0%, transparent 55%)' }} />
        {news.category && (
          <span className="absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-white"
            style={{ background: GOLD, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em' }}>
            {news.category}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {news.actress && (
          <span className="inline-block w-fit rounded-full px-2.5 py-0.5"
            style={{ border: `1px solid ${GOLD}40`, color: GOLD, fontSize: 10, fontWeight: 600 }}>
            {news.actress.name}
          </span>
        )}
        <a href={href}>
          <h3 className="text-sm font-semibold leading-snug line-clamp-2 hover:underline" style={{ color: CREAM }}>
            {news.title}
          </h3>
        </a>
        {news.summary && (
          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: MUTED }}>{news.summary}</p>
        )}
        <a href={href} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: GOLD }}>
          続きを読む <ArrowRight size={10} />
        </a>
      </div>
    </article>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export function PresentationClient({ sampleNews }: { sampleNews: SnNewsWithActress[] }) {
  const [atTop, setAtTop] = useState(true)
  useEffect(() => {
    const fn = () => setAtTop(window.scrollY < 40)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div style={{ background: BG, color: CREAM }}>

      {/* ══════════════════════════════════════════════════════════════════
          ① HERO
      ══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden px-6 pt-20 pb-16 lg:pt-28 lg:pb-24">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 75% 65% at 50% 25%, ${GOLD}0c 0%, transparent 70%)` }} />
        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${GOLD}16 1px, transparent 1px)`,
            backgroundSize: '30px 30px',
          }} />
        {/* Corner ornaments */}
        {['left-8 top-8 border-l border-t', 'right-8 top-8 border-r border-t',
          'left-8 bottom-16 border-l border-b', 'right-8 bottom-16 border-r border-b'].map((cls, i) => (
          <div key={i} className={`pointer-events-none absolute h-16 w-16 ${cls}`}
            style={{ borderColor: `${GOLD}22` }} />
        ))}

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">

            {/* Left: text */}
            <div className="space-y-7" style={{ animation: 'heroIn 1.1s cubic-bezier(.16,1,.3,1) both' }}>
              <p style={{ color: GOLD, letterSpacing: '0.55em', fontSize: 10, fontWeight: 700 }}>
                MEDIA KIT 2025
              </p>
              <h1 style={{
                fontFamily: SERIF,
                fontSize: 'clamp(2.6rem, 6.5vw, 5rem)',
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: '-0.01em',
                color: CREAM,
              }}>
                AI×<br />プロフェッショナリズム。<br />
                <span style={{ color: GOLD }}>次世代エンタメ</span><br />
                メディア VERITY
              </h1>
              <GoldLine className="max-w-[5rem]" />
              <p className="text-sm leading-loose max-w-sm" style={{ color: MUTED }}>
                予約販売期（発売 <strong style={{ color: CREAM }}>10日前</strong>）を狙う戦略的SEOと、<br />
                <strong style={{ color: CREAM }}>1,100名超</strong>のデータベースが、<br />
                圧倒的なコンバージョンを生み出す。
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a href="/verity/contact"
                  className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-bold transition-all hover:brightness-110 active:scale-95"
                  style={{ background: GOLD, color: BG, boxShadow: `0 0 32px ${GOLD}50` }}>
                  パートナーシップを相談する <ArrowRight size={13} />
                </a>
                <a href="/verity"
                  className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-all"
                  style={{ border: `1px solid ${GOLD}45`, color: GOLD }}>
                  サイトを見る
                </a>
              </div>
            </div>

            {/* Right: screenshot carousel */}
            <div style={{ animation: 'heroIn 1.1s cubic-bezier(.16,1,.3,1) .18s both' }}>
              <HeroCarousel />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 transition-opacity duration-500"
          style={{ color: `${GOLD}70`, opacity: atTop ? 1 : 0 }}
        >
          <span style={{ fontSize: 9, letterSpacing: '0.35em' }}>SCROLL</span>
          <ChevronDown size={14} style={{ animation: 'bounceY 2.2s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${GOLD}28`, borderBottom: `1px solid ${GOLD}28`, background: `${GOLD}07` }}>
        <div className="mx-auto max-w-5xl px-6 py-11 grid grid-cols-2 gap-6 sm:grid-cols-4 text-center">
          {[
            { num: '1,100+', label: '登録女優数' },
            { num: '毎日',   label: 'AI 記事自動生成' },
            { num: '10日前', label: '戦略的 SEO 先行索引' },
            { num: '100%',  label: 'コンプライアント' },
          ].map(({ num, label }, i) => (
            <Reveal key={label} delay={i * 80}>
              <p style={{ fontFamily: SERIF, fontSize: 'clamp(1.5rem,3.5vw,2.5rem)', fontWeight: 700, color: GOLD, lineHeight: 1 }}>
                {num}
              </p>
              <p className="mt-2" style={{ fontSize: 10, letterSpacing: '0.18em', color: MUTED }}>{label}</p>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ② THE VERITY ADVANTAGE
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-32 space-y-24">

        {/* Section heading */}
        <Reveal>
          <SectionTag>02 — The VERITY Advantage</SectionTag>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15, maxWidth: '30rem' }}>
            競合が持ちえない、<br />3つのコア・バリュー
          </h2>
          <GoldLine className="mt-6 max-w-[6rem]" />
        </Reveal>

        {/* ── Pillar 1: Strategic AI Journalism ── */}
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal from="left">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Brain size={19} strokeWidth={1.4} style={{ color: GOLD }} />
                <GoldBadge>01 / Strategic AI Journalism</GoldBadge>
              </div>
              <h3 style={{ fontFamily: SERIF, fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 700, color: CREAM, lineHeight: 1.2 }}>
                戦略的AI生成
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                独自アルゴリズムで「is_recommended 女優」「人気ランキング Top30」「旬の新作（<strong style={{ color: CREAM }}>発売10日前以降</strong>）」を毎日自動で記事化。最も購買意欲が高まる黄金タイミングで検索インデックスを独占する。
              </p>
              <ul className="space-y-3">
                {[
                  'Gemini API による高品質な日本語ニュース自動生成（毎日 Cron 実行）',
                  'is_recommended・ランキング上位の女優を優先抽出（Priority 1→2→3）',
                  '高解像度フルパッケージ画像（pl.jpg/jp.jpg）で視覚的インパクトを最大化',
                  '429リトライ・JSONパースエラー対策による 24/7 安定稼働',
                ].map(t => (
                  <li key={t} className="flex items-start gap-3 text-sm" style={{ color: MUTED }}>
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full flex-shrink-0" style={{ background: GOLD }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal from="right" delay={120}>
            {/* VERITY04 = 予約・先行公開 (10日前戦略の実証) */}
            <BrowserFrame url="verity-official.com/#pre-orders">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/lp/VERITY04.jpg" alt="予約・先行公開セクション — 10日前戦略" className="w-full object-cover object-top" style={{ maxHeight: 420 }} />
            </BrowserFrame>
          </Reveal>
        </div>

        <GoldLine />

        {/* ── Pillar 2: Flawless Compliance ── */}
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal from="left" delay={120}>
            {/* Compliance checklist visual */}
            <div className="rounded-2xl p-8 space-y-5" style={{ border: `1px solid ${GOLD}28`, background: BG2 }}>
              <p style={{ fontFamily: SERIF, fontSize: '0.85rem', fontWeight: 700, color: GOLD, letterSpacing: '0.2em' }}>
                COMPLIANCE CHECKLIST
              </p>
              {[
                { label: 'サイト全体 — レイアウト上部', item: '「本ページにはプロモーション（広告・アフィリエイトリンク）が含まれています」を自動表示', ok: true },
                { label: 'アフィリエイトリンク', item: '「PR」バッジ（視覚バッジ）をリンク横に常時表示', ok: true },
                { label: '購入導線', item: 'rel="sponsored noopener noreferrer" を自動付与', ok: true },
                { label: '景品表示法（2023年10月施行）', item: 'ステマ規制に完全準拠 — 設計レベルで担保', ok: true },
                { label: 'パートナーのリスク', item: '広告主・メーカー・事務所に一切の対応負担なし', ok: true },
              ].map(({ label, item, ok }) => (
                <div key={label} className="flex items-start gap-3.5 pb-4"
                  style={{ borderBottom: `1px solid ${GOLD}14` }}>
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ background: '#22c55e14', border: '1px solid #22c55e55' }}>
                    <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>✓</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: GOLD, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 3 }}>{label}</p>
                    <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{item}</p>
                  </div>
                </div>
              ))}
              <p className="text-center text-xs pt-1" style={{ color: MUTED }}>
                パートナーに <strong style={{ color: CREAM }}>一切のコンプライアンスリスク</strong> を負わせない構造設計
              </p>
            </div>
          </Reveal>
          <Reveal from="right">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Shield size={19} strokeWidth={1.4} style={{ color: GOLD }} />
                <GoldBadge>02 / Flawless Compliance</GoldBadge>
              </div>
              <h3 style={{ fontFamily: SERIF, fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 700, color: CREAM, lineHeight: 1.2 }}>
                完璧な法的<br />コンプライアンス
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                景表法（ステマ規制）に完全対応。全ページ・全購入導線にPR表記を自動付与。サイト設計のレベルでコンプライアンスを担保するため、パートナーは告知作業を一切しなくてよい。
              </p>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                「後から対応」ではなく<strong style={{ color: CREAM }}>構造的コンプライアンス</strong>—— これがVERITYとその他アフィリエイトサイトの本質的な差異。
              </p>
              <div className="rounded-xl px-5 py-4 mt-2"
                style={{ border: `1px solid ${GOLD}30`, background: `${GOLD}08` }}>
                <p style={{ fontFamily: SERIF, fontSize: '0.85rem', fontWeight: 700, color: CREAM, marginBottom: 6 }}>
                  パートナーへの約束
                </p>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                  貴社の作品・女優名がVERITYに掲載される際、すべての広告表記は自動で処理されます。貴社に確認・対応の手間は一切発生しません。
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <GoldLine />

        {/* ── Pillar 3: Multi-Brand Architecture ── */}
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <Reveal from="left">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Layers size={19} strokeWidth={1.4} style={{ color: GOLD }} />
                <GoldBadge>03 / Multi-Brand Architecture</GoldBadge>
              </div>
              <h3 style={{ fontFamily: SERIF, fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 700, color: CREAM, lineHeight: 1.2 }}>
                拡張型<br />マルチブランド
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                Next.js App Router と Supabase による堅牢なマルチブランド構成（<code style={{ color: CREAM, fontSize: 11 }}>src/app/[siteKey]</code>）。VERITYと同じ基盤で、ニッチジャンル特化サイトや特定事務所向けの専用メディアを最短で構築できる。
              </p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {[
                  { t: 'Next.js 16', s: 'App Router + Server Components' },
                  { t: 'Supabase', s: 'RLS / RPC / Realtime' },
                  { t: 'Gemini API', s: 'AI Content Generation' },
                  { t: 'DMM API', s: 'Official Data Source' },
                ].map(({ t, s }) => (
                  <div key={t} className="rounded-lg px-4 py-3.5"
                    style={{ border: `1px solid ${GOLD}22`, background: `${GOLD}06` }}>
                    <p style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: CREAM }}>{t}</p>
                    <p style={{ fontSize: 10, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>{s}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal from="right" delay={120}>
            {/* VERITY07 = 広いフィルター画面 (アーキテクチャの幅を示す) */}
            <BrowserFrame url="verity-official.com">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/lp/VERITY07.jpg" alt="マルチブランドアーキテクチャ — フィルターUI" className="w-full object-cover object-top" style={{ maxHeight: 420 }} />
            </BrowserFrame>
          </Reveal>
        </div>

      </section>

      <GoldLine className="mx-auto max-w-5xl px-6" />

      {/* ══════════════════════════════════════════════════════════════════
          ③ DATA & SEO INFRASTRUCTURE
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-32">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">

          {/* Text */}
          <Reveal from="left">
            <SectionTag>03 — Data & SEO Infrastructure</SectionTag>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem,5vw,3.3rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>
              圧倒的な<br />データベースと<br />SEO基盤
            </h2>
            <GoldLine className="mt-6 mb-10 max-w-[6rem]" />
            <div className="space-y-8">
              {[
                {
                  Icon: Database,
                  num: '1,100名超',
                  title: '女優データベース',
                  body: 'DMM APIと直結。プロフィール・作品データ・関連SNSを一元管理。AI記事生成と完全自動連携し、女優ページへの自然流入を創出。',
                },
                {
                  Icon: Globe,
                  num: '2,000+ URL',
                  title: '正確なサイトマップ',
                  body: '全女優ページ・記事ページ・カテゴリを網羅したサイトマップを動的生成。Googleクローラーを誘導し、検索インデックス規模を最大化。',
                },
                {
                  Icon: TrendingUp,
                  num: 'OGP完全対応',
                  title: '高解像度プロキシ配信',
                  body: 'DMM CDN画像をプロキシ経由で jp.jpg→pl.jpg→ps.jpg の順で自動昇格配信。SNS投稿時に高解像度フルパッケージ画像が表示される。',
                },
              ].map(({ Icon, num, title, body }, i) => (
                <Reveal key={title} delay={i * 90}>
                  <div className="flex gap-5">
                    <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ border: `1px solid ${GOLD}35`, background: `${GOLD}0b` }}>
                      <Icon size={18} strokeWidth={1.4} style={{ color: GOLD }} />
                    </div>
                    <div>
                      <p style={{ fontFamily: SERIF, fontSize: '1.15rem', fontWeight: 700, color: GOLD, lineHeight: 1 }}>{num}</p>
                      <p style={{ fontFamily: SERIF, fontSize: '0.95rem', fontWeight: 700, color: CREAM, marginTop: 5, marginBottom: 6 }}>{title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>

          {/* Screenshot stack */}
          <Reveal from="right" delay={160}>
            <div className="relative">
              {/* Back: 旬の女優 最新作 */}
              <div className="absolute -bottom-6 -left-6 w-full rounded-xl overflow-hidden"
                style={{ border: `1px solid ${GOLD}18`, opacity: 0.5, transform: 'rotate(-2deg)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/lp/VERITY03.jpg" alt="旬の女優 最新作" className="w-full object-cover object-top" style={{ maxHeight: 300 }} />
              </div>
              {/* Front: VERITYオススメ女優 */}
              <div style={{ transform: 'rotate(1.5deg)' }}>
                <BrowserFrame url="verity-official.com/#recommended">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/lp/VERITY02.jpg" alt="VERITYオススメ女優" className="w-full object-cover object-top" style={{ maxHeight: 340 }} />
                </BrowserFrame>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <GoldLine className="mx-auto max-w-5xl px-6" />

      {/* ══════════════════════════════════════════════════════════════════
          ④ THE PROFESSIONAL'S TOUCH
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-32">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">

          {/* Screenshot: THE MUST ONE */}
          <Reveal from="left">
            <BrowserFrame url="verity-official.com/#the-must-one">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/lp/VERITY08.jpg" alt="THE MUST ONE — 編集長の一本 with VERITY SCORE" className="w-full object-cover" />
            </BrowserFrame>
          </Reveal>

          {/* Text */}
          <Reveal from="right" delay={120}>
            <SectionTag>04 — The Professional&apos;s Touch</SectionTag>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem,5vw,3.3rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>
              編集長の矜持
            </h2>
            <GoldLine className="mt-6 mb-8 max-w-[5rem]" />
            <p className="text-sm leading-relaxed mb-6" style={{ color: MUTED }}>
              VERITYは「単なるAI自動生成サイト」ではない。AIが生成した下書きをプロの視点で精査・昇華し、<strong style={{ color: CREAM }}>「読まれるコンテンツ」</strong>に仕上げる編集長が存在する。
            </p>

            {/* THE MUST ONE callout */}
            <div className="rounded-xl p-6 mb-6"
              style={{ border: `1px solid ${GOLD}35`, background: `${GOLD}08` }}>
              <div className="flex items-center gap-2 mb-3">
                <Award size={14} style={{ color: GOLD }} />
                <p style={{ fontFamily: SERIF, fontSize: '0.95rem', fontWeight: 700, color: CREAM }}>
                  THE MUST ONE
                </p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                毎月1本、編集長が「今月これだけは観てほしい」と断言できる作品をピックアップ。独自の VERITY SCORE レーダーチャート（演技力・ルックス・映像美・フェチ性・中毒性の5軸）で多角的に評価し、一次情報としての権威を確立する。
              </p>
            </div>

            <p className="text-sm leading-relaxed mb-6" style={{ color: MUTED }}>
              独占インタビューなど一次情報コンテンツにより、<strong style={{ color: CREAM }}>他のアフィリエイトサイトが追随できないドメイン権威</strong>を構築し続ける。
            </p>

            <ul className="space-y-2.5">
              {[
                'EDITOR\'S PICK として独自の評価視点を提供',
                '演技力・ルックス・映像美・フェチ性・中毒性の5軸レーダーチャート',
                'プロインタビュアーによる独占取材コンテンツ（予定）',
                'AIでは代替不可能な「人間の一次情報」が権威付けを担保',
              ].map(t => (
                <li key={t} className="flex items-start gap-2.5 text-xs" style={{ color: MUTED }}>
                  <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: GOLD }} />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <GoldLine className="mx-auto max-w-5xl px-6" />

      {/* ══════════════════════════════════════════════════════════════════
          ⑤ LIVE CONTENT DEMO
      ══════════════════════════════════════════════════════════════════ */}
      {sampleNews.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-32">
          <Reveal>
            <SectionTag>05 — Live Content</SectionTag>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem,5vw,3.3rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>
              実際に動くコンテンツ
            </h2>
            <p className="mt-4 text-sm leading-relaxed max-w-xl" style={{ color: MUTED }}>
              以下はVERITYに現在公開されているAI生成ニュース記事のリアルタイムプレビューです。高解像度フルパッケージ画像（pl.jpg）による視覚的インパクトをご確認ください。
            </p>
            <GoldLine className="mt-6 mb-12 max-w-[8rem]" />
          </Reveal>

          {/* News grid inside browser chrome */}
          <Reveal delay={100}>
            <div className="rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${GOLD}30`, background: BG2 }}>
              <div className="flex items-center gap-3 px-5 py-3"
                style={{ borderBottom: `1px solid ${GOLD}18`, background: '#0a0a14' }}>
                <div className="flex gap-1.5">
                  {['#ff5f57', '#febc2e', '#28c840'].map(c => (
                    <div key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
                  ))}
                </div>
                <div className="flex-1 rounded-lg px-4 py-1.5 text-center"
                  style={{ background: '#141420', fontSize: 11, color: MUTED }}>
                  verity-official.com/news
                </div>
              </div>
              <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3">
                {sampleNews.map((news, i) => (
                  <Reveal key={news.id} delay={i * 70}>
                    <DemoNewsCard news={news} />
                  </Reveal>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Article detail screenshot */}
          <Reveal delay={180} className="mt-12">
            <p className="text-center text-[10px] tracking-[0.25em] mb-5" style={{ color: MUTED }}>
              ARTICLE DETAIL — 高解像度フルパッケージ画像（pl.jpg） + 購入導線
            </p>
            <div className="mx-auto max-w-xl px-4 sm:px-0">
              <BrowserFrame url="verity-official.com/news/[article-slug]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/lp/VERITY06.jpg" alt="記事詳細ページ — フルパッケージ画像表示" className="w-full h-auto" />
              </BrowserFrame>
            </div>
          </Reveal>
        </section>
      )}

      {sampleNews.length > 0 && <GoldLine className="mx-auto max-w-5xl px-6" />}

      {/* ══════════════════════════════════════════════════════════════════
          ⑥ ENGAGEMENT LAYER (LP System)
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-7xl px-6 py-32">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">

          {/* Text */}
          <Reveal from="left">
            <SectionTag>06 — Engagement Layer</SectionTag>
            <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem,5vw,3.3rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>
              ファンを<br />「常連」に変える<br />エンゲージメント設計
            </h2>
            <GoldLine className="mt-6 mb-8 max-w-[6rem]" />
            <p className="text-sm leading-relaxed mb-8" style={{ color: MUTED }}>
              LP（ラブポイント）システムと称号バッジにより、ユーザーが推し女優を応援し続けるインセンティブを設計。毎日のログインと購入クリックが長期エンゲージメントへと変換される。
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '👑', title: 'VERITYマスター', desc: '3名の推し女優が全員王冠バッジ獲得で解放' },
                { icon: '💜', title: 'LP経済圏', desc: '毎日+1LP、7日連続+6LP、購入クリック+5LP' },
                { icon: '🏅', title: '称号システム', desc: '新参者→推し活家→常連→コレクター' },
                { icon: '📊', title: 'ジャンル傾向分析', desc: 'ユーザー行動データを可視化・ログ蓄積' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="rounded-xl p-4"
                  style={{ border: `1px solid ${GOLD}22`, background: `${GOLD}06` }}>
                  <p className="text-2xl mb-2">{icon}</p>
                  <p style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: CREAM, marginBottom: 5 }}>{title}</p>
                  <p style={{ fontSize: 10, color: MUTED, lineHeight: 1.55 }}>{desc}</p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Screenshot */}
          <Reveal from="right" delay={120}>
            <BrowserFrame url="verity-official.com/profile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/lp/VERITY11.jpg" alt="マイページ — LP・称号システム" className="w-full object-cover object-top" style={{ maxHeight: 520 }} />
            </BrowserFrame>
          </Reveal>
        </div>
      </section>

      <GoldLine className="mx-auto max-w-5xl px-6" />

      {/* ══════════════════════════════════════════════════════════════════
          ⑦ ROADMAP
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-4xl px-6 py-32">
        <Reveal>
          <SectionTag>07 — Roadmap</SectionTag>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>
            収益化への展望
          </h2>
          <GoldLine className="mt-6 mb-16 max-w-[6rem]" />
        </Reveal>

        <div className="relative pl-8" style={{ borderLeft: `1px solid ${GOLD}28` }}>
          <div className="space-y-14">
            {[
              {
                phase: 'Phase 1', status: 'Live', sc: '#34d399', sb: '#34d39918',
                title: 'コアメディア機能',
                items: ['女優データベース（1,100名+）', 'Gemini AI 記事自動生成（毎日 Cron）', 'FANZA連携・アフィリエイト収益化', 'ユーザーポイント & 称号システム', '景表法完全対応（PR表記自動付与）'],
              },
              {
                phase: 'Phase 2', status: 'In Progress', sc: '#60a5fa', sb: '#60a5fa18',
                title: '予約投稿 & SNS 自動拡散',
                items: ['X/Twitter 自動投稿スケジューラー', '予約投稿 & コンテンツカレンダー', 'OGP最適化・SNSエンゲージメント計測'],
              },
              {
                phase: 'Phase 3', status: 'Planned', sc: GOLD, sb: `${GOLD}18`,
                title: 'ファンコミュニティ機能',
                items: ['有料会員制（サブスクリプション）', 'ファンクラブ & LP 経済圏拡張', '女優公認インタラクティブコンテンツ'],
              },
              {
                phase: 'Phase 4', status: 'Vision', sc: '#ffffff40', sb: '#ffffff08',
                title: '業界プラットフォーム化',
                items: ['プロダクション公式連携', 'マルチブランド本格展開（複数サイト同時運用）', '広告配信最適化・データダッシュボード'],
              },
            ].map(({ phase, status, sc, sb, title, items }, i) => (
              <Reveal key={phase} delay={i * 90}>
                <div className="relative">
                  <div className="absolute -left-[2.3rem] top-1.5 h-4 w-4 rounded-full"
                    style={{ border: `2px solid ${GOLD}`, background: BG }} />
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: '0.28em' }}>{phase}</span>
                    <span className="rounded-full px-2.5 py-0.5"
                      style={{ background: sb, color: sc, fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', border: `1px solid ${sc}35` }}>
                      {status}
                    </span>
                  </div>
                  <h3 style={{ fontFamily: SERIF, fontSize: '1.3rem', fontWeight: 700, color: CREAM, marginBottom: 14 }}>{title}</h3>
                  <ul className="space-y-2">
                    {items.map(item => (
                      <li key={item} className="flex items-center gap-2.5 text-sm" style={{ color: MUTED }}>
                        <div className="h-px w-4 shrink-0" style={{ background: `${GOLD}45` }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CTA
      ══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-40 text-center">
        <div className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(ellipse 75% 85% at 50% 50%, ${GOLD}16 0%, transparent 65%)` }} />
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }} />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }} />
        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(${GOLD}10 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }} />

        <Reveal className="relative z-10 space-y-8 px-6">
          <p style={{ color: GOLD, fontSize: 10, fontWeight: 700, letterSpacing: '0.55em' }}>
            PARTNERSHIP INQUIRY
          </p>
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(2.2rem,5.5vw,4rem)', fontWeight: 700, color: CREAM, lineHeight: 1.15 }}>
            ともに、新時代を<br />切り拓きませんか。
          </h2>
          <p className="text-sm leading-relaxed max-w-lg mx-auto" style={{ color: MUTED }}>
            事務所・メーカー・アフィリエイターとのパートナーシップを歓迎しています。<br />
            詳細はお問い合わせフォームよりご連絡ください。
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <a href="/verity/contact"
              className="inline-flex items-center gap-2 rounded-full px-10 py-4 text-sm font-bold transition-all hover:brightness-110 active:scale-95"
              style={{ background: GOLD, color: BG, boxShadow: `0 0 40px ${GOLD}55` }}>
              お問い合わせ <ArrowRight size={14} />
            </a>
            <a href="/verity"
              className="inline-flex items-center gap-2 rounded-full px-10 py-4 text-sm font-bold transition-all hover:border-opacity-100"
              style={{ border: `1px solid ${GOLD}50`, color: GOLD }}>
              サイトを見る
            </a>
          </div>
        </Reveal>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════════ */}
      <footer className="py-14 text-center" style={{ borderTop: `1px solid ${GOLD}18` }}>
        <p style={{ fontFamily: SERIF, fontSize: '2rem', fontWeight: 700, letterSpacing: '0.28em', color: GOLD }}>
          VERITY
        </p>
        <p className="mt-2" style={{ fontSize: 10, letterSpacing: '0.28em', color: `${MUTED}70` }}>
          NEXT-GENERATION ADULT MEDIA PLATFORM
        </p>
      </footer>

      {/* ── Keyframes ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes heroIn {
          from { opacity: 0; transform: translateY(26px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes bounceY {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(8px); }
        }
      `}</style>
    </div>
  )
}
