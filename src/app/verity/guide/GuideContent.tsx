'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Zap, Heart, Brain, ShieldCheck, Sparkles, ArrowRight,
  Clock, Lock, UserCheck, Database, Star, BookOpen,
  LayoutGrid, Trophy, Building2, BadgeCheck,
} from 'lucide-react'

type Lang = 'ja' | 'en' | 'th'

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-3 py-1 text-[11px] font-bold tracking-widest uppercase text-[var(--magenta)]">
      {children}
    </span>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-[var(--magenta-dim)] text-sm font-black text-white shadow-[0_0_16px_rgba(226,0,116,0.45)]">
      {n}
    </div>
  )
}

function NeonCard({
  icon: Icon,
  title,
  body,
  accent = 'magenta',
}: {
  icon: React.ElementType
  title: string
  body: string
  accent?: 'magenta' | 'emerald' | 'sky' | 'amber'
}) {
  const map = {
    magenta: 'border-[var(--magenta)]/30 bg-[var(--magenta)]/8 text-[var(--magenta)]',
    emerald: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400',
    sky:     'border-sky-500/30 bg-sky-500/8 text-sky-400',
    amber:   'border-amber-500/30 bg-amber-500/8 text-amber-400',
  }
  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${map[accent]}`}>
      <Icon size={22} />
      <p className="font-bold text-[var(--text)]">{title}</p>
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">{body}</p>
    </div>
  )
}

// Splits a string on \n and inserts <br /> between segments
function Nl({ text }: { text: string }) {
  const parts = text.split('\n')
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

// ── Content dictionary ──────────────────────────────────────────────────────

const C = {
  ja: {
    badge: 'VERITYの遊び方',
    h1a:  '3ステップで攻略、',
    h1b:  'VERITY完全ガイド',
    sub:  'FANZA公式データ直結・ログイン不要のお気に入り・マイページ属性解析——すべて無料で使えます。',
    stats: [
      { label: '監視メーカー', value: '58社+' },
      { label: 'ジャンル数',   value: '80種+' },
      { label: '利用料金',     value: '完全無料' },
    ],
    steps: [
      {
        badge:  'STEP 1 ── ディグる',
        icon:   Zap,
        title:  '24時間バッジで\n今日の新作を狙い撃ち',
        desc:   'VERITYはS1・アイデアポケット・マドンナ・無垢など58社以上のメーカーを毎日0:00 JSTに自動巡回し、最新作を1作品1記事の厳格ルールでDBに収録。ジャンル別80種+の専用カタログと、アルゴリズムが選ぶ「今夜の一本」で今日の一番を即座に見つけられます。',
        cards: [
          { accent: 'magenta' as const, icon: Zap,        title: '「NEW」バッジ（24時間時限）',  body: '公開から24時間以内に自動点灯するNEONバッジ。ページをリロードするたびに最新状態を反映。' },
          { accent: 'sky'     as const, icon: Clock,      title: '発売日ソート',                  body: 'トップページの切り替えスイッチで「新着順」に即時ソート。今日出たばかりの作品が最上位へ。' },
          { accent: 'emerald' as const, icon: LayoutGrid, title: 'ジャンル別カタログ（80種+）',   body: 'キャバ嬢・風俗嬢、ヘルス・ソープ、中出し、単体、4K、人妻、熟女……80種以上のジャンルページが毎日自動更新。' },
          { accent: 'amber'   as const, icon: Trophy,     title: '今夜の一本（TODAY\'S PICK）',   body: '鮮度スコア×単体ボーナスのアルゴリズムが毎日0:00に最旬の1作品を自動選出。今夜の答えはここに。' },
        ],
        timeline: {
          label: 'VERITYの更新サイクル',
          items: [
            { time: '毎日 0:00 JST', label: '58社+を自動巡回・1作品1記事ルールでDB収録・TODAY\'S PICK算出' },
            { time: '毎日 6:00 JST', label: '人気女優ランキングを更新' },
            { time: 'リアルタイム',  label: '編集部キュレーションを随時追加' },
          ],
        },
      },
      {
        badge: 'STEP 2 ── 集める',
        icon:  Heart,
        title: '登録不要、ハートを\nタップするだけ',
        desc:  '作品カードや女優ページの❤️をタップするだけで、お気に入りがこのデバイスにローカル保存されます。アカウント不要。3件以上保存するとマイページ連携の案内が自動で表示されます。',
        cards: [
          { accent: 'magenta' as const, icon: Heart,    title: '登録・ログイン不要',      body: 'ブラウザのLocalStorageに保存。プライベートモードでも使えます。' },
          { accent: 'sky'     as const, icon: Star,     title: '作品・ニュース全対応',    body: '動画・DVD・同人コミック・ニュース記事——VERITYのすべてのコンテンツにハート機能を搭載。' },
          { accent: 'emerald' as const, icon: BookOpen, title: 'マイページに自動表示',    body: '保存したお気に入りはマイページの「お気に入り作品一覧」にリスト表示されます。' },
        ],
      },
      {
        badge: 'STEP 3 ── 構築する',
        icon:  Brain,
        title: 'マイページ登録で\nすべてがクラウドへ',
        desc:  '30秒・完全無料で会員登録すると、ローカルに保存したお気に入りが自動でクラウドに同期。「大人の属性カルテ」で気づいていなかった自分の性癖が解析され、今夜の運命の1本が導き出されます。',
        flow: [
          { icon: Heart,    title: 'お気に入り登録',      body: '気になる女優・作品をポチるだけ。登録するほど精度が上がります。' },
          { icon: Brain,    title: 'VERITYが成分解析',    body: 'ジャンル・タグ・女優の傾向をAIが自動解析。' },
          { icon: Sparkles, title: '称号と推薦作を受け取る', body: '「○○系紳士」などの称号と今夜観るべき1本が表示されます。' },
        ],
        cta: { href: '/verity/profile', label: 'マイページを見てみる' },
      },
    ],
    dq: {
      badge: 'データ品質宣言',
      title: '1作品1記事ルール ── 重複ゼロ保証',
      desc:  'VERITYでは同一CID（作品ID）に対して複数の記事が生まれることを構造レベルで禁止しています。新作発見時はUPSERTで既存レコードを更新し、初出CIDのみINSERT。これにより検索・ランキング・TODAY\'S PICKのすべての精度が担保されます。',
      makers: {
        label: '自動巡回メーカー（抜粋）',
        items: ['S1 NO.1 STYLE', 'アイデアポケット', 'マドンナ', 'MOODYZ', 'MUTEKI', '無垢', 'million', 'Prestige (global)', '…他50社+'],
      },
    },
    sec: {
      badge: '安心・安全',
      title: '【安心・安全宣言】',
      sub:   '登録をためらっているあなたへ',
      items: [
        { icon: UserCheck, color: 'text-emerald-400', bg: 'border-emerald-500/25 bg-emerald-500/8', title: '完全匿名・永久無料',                body: 'メールアドレス（またはGoogleアカウント）だけで登録完了。氏名・住所・クレジットカードは一切不要。料金は永久に0円です。' },
        { icon: Lock,      color: 'text-sky-400',     bg: 'border-sky-500/25 bg-sky-500/8',         title: 'SNS連携ゼロ・身バレ100%なし',       body: 'VERITYはSNSと連携しません。お気に入り登録・閲覧履歴がフォロワーに知られることは絶対にありません。' },
        { icon: Database,  color: 'text-amber-400',   bg: 'border-amber-500/25 bg-amber-500/8',     title: '世界基準のセキュリティで暗号化保護', body: '認証データはSupabase（PostgreSQL + RLS）により厳重に保護。業界標準JWT認証を採用し、あなたの情報は第三者に渡しません。' },
      ],
    },
    cta: {
      eyebrow: 'Join VERITY — Free Forever',
      title:   'さあ、あなたの「推し」を見つけよう',
      sub:     '登録30秒・完全無料・身バレなし。\nまずはハートを押すだけでもOKです。',
      btn:     '無料で今すぐ始める',
      ghost:   'まずはトップページへ',
      note:    'クレジットカード不要・個人情報（氏名・住所）の入力なし',
    },
  },

  en: {
    badge: 'How to VERITY',
    h1a:  '3 Steps to Master',
    h1b:  'VERITY',
    sub:  'Real-time FANZA data · No-login favorites · MyPage profile analysis — all completely free.',
    stats: [
      { label: 'Maker Labels', value: '58+' },
      { label: 'Genres',       value: '80+' },
      { label: 'Price',        value: 'Always free' },
    ],
    steps: [
      {
        badge: 'STEP 1 — DIG',
        icon:  Zap,
        title: 'Spot New Drops\nWith the 24h Badge',
        desc:  'VERITY auto-crawls 58+ maker labels (S1, Idea Pocket, Madonna, MUKU, million...) every day at 0:00 JST, storing each title under the strict one-title-one-article rule. Browse 80+ genre catalogs or let TODAY\'S PICK\'s algorithm surface the freshest must-watch instantly.',
        cards: [
          { accent: 'magenta' as const, icon: Zap,        title: '24h NEW Badge',              body: 'Auto-lights on anything published in the last 24 hours. Reloading always shows the freshest state.' },
          { accent: 'sky'     as const, icon: Clock,      title: 'Release-Date Sort',           body: 'Toggle the sort switch on the top page to sort by newest. Today\'s releases jump straight to the top.' },
          { accent: 'emerald' as const, icon: LayoutGrid, title: 'Genre Catalogs (80+ types)',  body: 'Cabaret girls, health/soapland, creampie, solo, 4K, married women, mature… 80+ genre pages updated daily.' },
          { accent: 'amber'   as const, icon: Trophy,     title: 'TODAY\'S PICK',               body: 'Freshness score × solo bonus algorithm auto-selects the day\'s top pick at 0:00 JST every night.' },
        ],
        timeline: {
          label: 'VERITY Update Schedule',
          items: [
            { time: 'Daily 0:00 JST', label: '58+ makers crawled · one-title-one-article DB sync · TODAY\'S PICK computed' },
            { time: 'Daily 6:00 JST', label: 'Top actress rankings refreshed' },
            { time: 'Real-time',      label: 'Editorial curations added continuously' },
          ],
        },
      },
      {
        badge: 'STEP 2 — COLLECT',
        icon:  Heart,
        title: 'No Account Needed —\nJust Tap ❤️',
        desc:  'Tap the ❤️ on any work card or actress page to save it locally on this device — no registration required. Collect 3 or more favorites and you\'ll see a prompt to sync with MyPage.',
        cards: [
          { accent: 'magenta' as const, icon: Heart,    title: 'No Login Required',     body: 'Saved to your browser\'s LocalStorage. Works in private/incognito mode too.' },
          { accent: 'sky'     as const, icon: Star,     title: 'Works & News Supported', body: 'Videos, DVDs, doujin comics, news articles — every piece of VERITY content has a heart button.' },
          { accent: 'emerald' as const, icon: BookOpen, title: 'Auto-shown in MyPage',   body: 'Your saved favorites appear as a list in the MyPage "Saved Works" section.' },
        ],
      },
      {
        badge: 'STEP 3 — BUILD',
        icon:  Brain,
        title: 'Register for MyPage\nSync to the Cloud',
        desc:  'Sign up in 30 seconds — free forever. Your locally saved favorites auto-sync to the cloud. The Adult Profile analysis reveals your taste profile and recommends tonight\'s must-watch.',
        flow: [
          { icon: Heart,    title: 'Add Favorites',          body: 'Tap ❤️ on any work or actress. The more you save, the sharper the analysis.' },
          { icon: Brain,    title: 'VERITY Analyzes',        body: 'Genres, tags, and actress preferences are auto-analyzed by our algorithm.' },
          { icon: Sparkles, title: 'Receive Your Profile',   body: 'Get a unique taste title and a personalized recommendation for tonight.' },
        ],
        cta: { href: '/verity/profile', label: 'View MyPage' },
      },
    ],
    dq: {
      badge: 'Data Quality',
      title: 'One Title, One Article — Zero Duplicates',
      desc:  'Every work is stored under a unique CID (content ID). When the crawler finds an existing title it UPSERTs the record; only truly new CIDs trigger an INSERT. This keeps search rankings, genre catalogs, and TODAY\'S PICK scoring accurate.',
      makers: {
        label: 'Auto-crawled maker labels (sample)',
        items: ['S1 NO.1 STYLE', 'Idea Pocket', 'Madonna', 'MOODYZ', 'MUTEKI', 'MUKU', 'million', 'Prestige (global)', '…50+ more'],
      },
    },
    sec: {
      badge: 'Safe & Secure',
      title: '[Safety Declaration]',
      sub:   'For those hesitant to register',
      items: [
        { icon: UserCheck, color: 'text-emerald-400', bg: 'border-emerald-500/25 bg-emerald-500/8', title: 'Fully Anonymous · Free Forever',   body: 'Register with just an email (or Google account). No name, address, or credit card required — ever. Price: ¥0 forever.' },
        { icon: Lock,      color: 'text-sky-400',     bg: 'border-sky-500/25 bg-sky-500/8',         title: 'Zero SNS Links · 100% Private',     body: 'VERITY never connects to social networks. Your favorites and browsing history are never visible to followers or anyone else.' },
        { icon: Database,  color: 'text-amber-400',   bg: 'border-amber-500/25 bg-amber-500/8',     title: 'World-Class Encrypted Security',    body: 'Auth data is protected by Supabase (PostgreSQL + RLS). Industry-standard JWT authentication. Your data stays yours.' },
      ],
    },
    cta: {
      eyebrow: 'Join VERITY — Free Forever',
      title:   'Find Your Favorites Tonight',
      sub:     '30-second signup · Free forever · Zero social exposure.\nOr just start tapping ❤️ — no account needed.',
      btn:     'Start Free Now',
      ghost:   'Go to Top Page',
      note:    'No credit card · No personal information required',
    },
  },

  th: {
    badge: 'วิธีใช้ VERITY',
    h1a:  '3 ขั้นตอนง่ายๆ',
    h1b:  'คู่มือ VERITY',
    sub:  'ข้อมูล FANZA แบบเรียลไทม์ · บันทึกรายการโปรดโดยไม่ต้องล็อกอิน · วิเคราะห์โปรไฟล์ใน MyPage — ทั้งหมดฟรี',
    stats: [
      { label: 'ค่ายผู้ผลิต', value: '58+ ราย' },
      { label: 'ประเภทเนื้อหา', value: '80+ แนว' },
      { label: 'ราคา',         value: 'ฟรีตลอดไป' },
    ],
    steps: [
      {
        badge: 'STEP 1 — ค้นหา',
        icon:  Zap,
        title: 'ระบุผลงานใหม่\nด้วยแบดจ์ 24 ชั่วโมง',
        desc:  'VERITY ตรวจสอบค่ายผู้ผลิตกว่า 58 รายอัตโนมัติทุกวันเวลา 0:00 JST โดยเก็บผลงานแต่ละชิ้นตามกฎ 1 ผลงาน 1 บทความ ค้นหาตามหมวดหมู่กว่า 80 ประเภท หรือปล่อยให้ TODAY\'S PICK คัดสรรผลงานเด่นประจำวันให้อัตโนมัติ',
        cards: [
          { accent: 'magenta' as const, icon: Zap,        title: 'แบดจ์ NEW (24 ชั่วโมง)',           body: 'ติดไฟโดยอัตโนมัติสำหรับทุกอย่างที่เผยแพร่ใน 24 ชั่วโมงล่าสุด รีโหลดหน้าเพื่อดูสถานะล่าสุดเสมอ' },
          { accent: 'sky'     as const, icon: Clock,      title: 'เรียงตามวันวางจำหน่าย',             body: 'สลับสวิตช์การเรียงบนหน้าหลักเพื่อให้รายการใหม่ขึ้นมาอยู่ด้านบนทันที' },
          { accent: 'emerald' as const, icon: LayoutGrid, title: 'หมวดหมู่ผลงาน (80+ ประเภท)',        body: 'คาบาเร่ต์, สปา, ครีมพาย, เดี่ยว, 4K, แม่บ้าน, สาวแก่... กว่า 80 หน้าหมวดหมู่ อัปเดตทุกวัน' },
          { accent: 'amber'   as const, icon: Trophy,     title: 'TODAY\'S PICK',                     body: 'อัลกอริทึมคะแนนความสด × โบนัสเดี่ยว คัดเลือกผลงานยอดเยี่ยมประจำวันอัตโนมัติทุกเที่ยงคืน JST' },
        ],
        timeline: {
          label: 'รอบการอัปเดต VERITY',
          items: [
            { time: 'ทุกวัน 0:00 JST', label: 'ตรวจ 58+ ค่าย · ซิงก์ DB แบบ 1 ผลงาน 1 บทความ · คำนวณ TODAY\'S PICK' },
            { time: 'ทุกวัน 6:00 JST', label: 'อัปเดตอันดับนักแสดงยอดนิยม' },
            { time: 'เรียลไทม์',       label: 'เพิ่มเนื้อหาคัดสรรโดยบรรณาธิการอย่างต่อเนื่อง' },
          ],
        },
      },
      {
        badge: 'STEP 2 — สะสม',
        icon:  Heart,
        title: 'ไม่ต้องล็อกอิน —\nแค่แตะ ❤️',
        desc:  'แตะ ❤️ บนการ์ดผลงานหรือหน้านักแสดงเพื่อบันทึกลงในอุปกรณ์นี้ — ไม่ต้องลงทะเบียน รวบรวมรายการโปรด 3 รายการขึ้นไปและคุณจะเห็นข้อความแนะนำให้ซิงก์กับ MyPage',
        cards: [
          { accent: 'magenta' as const, icon: Heart,    title: 'ไม่ต้องล็อกอิน',                   body: 'บันทึกใน LocalStorage ของเบราว์เซอร์ ใช้งานได้ในโหมดส่วนตัวด้วย' },
          { accent: 'sky'     as const, icon: Star,     title: 'รองรับผลงานและข่าว',                body: 'วิดีโอ, DVD, โดจิน, บทความข่าว — ทุกเนื้อหาใน VERITY มีปุ่มหัวใจ' },
          { accent: 'emerald' as const, icon: BookOpen, title: 'แสดงใน MyPage อัตโนมัติ',           body: 'รายการโปรดที่บันทึกไว้จะปรากฏเป็นรายการในส่วน "ผลงานที่บันทึก" ของ MyPage' },
        ],
      },
      {
        badge: 'STEP 3 — สร้าง',
        icon:  Brain,
        title: 'ลงทะเบียน MyPage\nซิงก์ไปยังคลาวด์',
        desc:  'สมัครใน 30 วินาที — ฟรีตลอดไป รายการโปรดที่บันทึกไว้ในเครื่องจะซิงก์กับคลาวด์โดยอัตโนมัติ การวิเคราะห์ Adult Profile จะเปิดเผยรสนิยมของคุณและแนะนำสิ่งที่ต้องดูคืนนี้',
        flow: [
          { icon: Heart,    title: 'เพิ่มรายการโปรด',        body: 'แตะ ❤️ บนผลงานหรือนักแสดงใดก็ได้ ยิ่งบันทึกมาก ยิ่งแม่นยำ' },
          { icon: Brain,    title: 'VERITY วิเคราะห์',        body: 'ประเภท แท็ก และความชอบนักแสดงถูกวิเคราะห์โดยอัลกอริทึม' },
          { icon: Sparkles, title: 'รับโปรไฟล์ของคุณ',        body: 'รับชื่อรสนิยมที่ไม่ซ้ำใครและคำแนะนำส่วนตัวสำหรับคืนนี้' },
        ],
        cta: { href: '/verity/profile', label: 'ดู MyPage' },
      },
    ],
    dq: {
      badge: 'คุณภาพข้อมูล',
      title: '1 ผลงาน 1 บทความ — ไม่มีซ้ำ',
      desc:  'ทุกผลงานถูกเก็บด้วย CID เฉพาะ เมื่อครอว์เลอร์พบผลงานที่มีอยู่แล้วจะทำการ UPSERT อัปเดตข้อมูล เฉพาะ CID ใหม่เท่านั้นที่จะถูก INSERT นี่คือสิ่งที่ทำให้การจัดอันดับ หมวดหมู่ และ TODAY\'S PICK มีความแม่นยำสูง',
      makers: {
        label: 'ค่ายที่ตรวจสอบอัตโนมัติ (ตัวอย่าง)',
        items: ['S1 NO.1 STYLE', 'Idea Pocket', 'Madonna', 'MOODYZ', 'MUTEKI', '無垢', 'million', 'Prestige (global)', '…อีกกว่า 50 ราย'],
      },
    },
    sec: {
      badge: 'ความปลอดภัย',
      title: '[คำประกาศความปลอดภัย]',
      sub:   'สำหรับผู้ที่ลังเลที่จะลงทะเบียน',
      items: [
        { icon: UserCheck, color: 'text-emerald-400', bg: 'border-emerald-500/25 bg-emerald-500/8', title: 'นิรนามสมบูรณ์ · ฟรีตลอดไป',      body: 'ลงทะเบียนด้วยอีเมล (หรือ Google) เท่านั้น ไม่ต้องใช้ชื่อ ที่อยู่ หรือบัตรเครดิต ราคา: ฟรีตลอดไป' },
        { icon: Lock,      color: 'text-sky-400',     bg: 'border-sky-500/25 bg-sky-500/8',         title: 'ไม่เชื่อมโยง SNS · เป็นส่วนตัว 100%', body: 'VERITY ไม่เชื่อมต่อกับโซเชียลมีเดีย รายการโปรดและประวัติการดูของคุณจะไม่มีใครเห็น' },
        { icon: Database,  color: 'text-amber-400',   bg: 'border-amber-500/25 bg-amber-500/8',     title: 'ความปลอดภัยระดับโลก',              body: 'ข้อมูลได้รับการคุ้มครองโดย Supabase (PostgreSQL + RLS) การยืนยันตัวตนมาตรฐาน JWT ข้อมูลของคุณอยู่กับคุณ' },
      ],
    },
    cta: {
      eyebrow: 'Join VERITY — Free Forever',
      title:   'ค้นหารายการโปรดของคุณคืนนี้',
      sub:     'สมัคร 30 วินาที · ฟรีตลอดไป · ไม่เปิดเผยตัวตน\nหรือเริ่มกด ❤️ ได้เลย — ไม่ต้องมีบัญชี',
      btn:     'เริ่มต้นฟรีทันที',
      ghost:   'ไปที่หน้าหลัก',
      note:    'ไม่ต้องใช้บัตรเครดิต · ไม่ต้องกรอกข้อมูลส่วนตัว',
    },
  },
} as const

// ── Language Switcher ───────────────────────────────────────────────────────

const LANGS: { code: Lang; label: string }[] = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'th', label: 'ภาษาไทย' },
]

function LangSwitcher({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => onChange(code)}
          className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
          style={
            lang === code
              ? { background: 'var(--magenta)', color: '#fff', boxShadow: '0 0 10px rgba(226,0,116,0.4)' }
              : { color: 'var(--text-muted)' }
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function GuideContent() {
  const [lang, setLang] = useState<Lang>('ja')

  useEffect(() => {
    const bl = navigator.language.toLowerCase()
    if (bl.startsWith('th')) setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else setLang('ja')
  }, [])

  const t = C[lang]

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-24">

      {/* ── HERO ── */}
      <section className="space-y-6 text-center">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-3 py-1 text-[11px] font-bold tracking-widest uppercase text-[var(--magenta)]">
            <Sparkles size={10} />
            {t.badge}
          </span>
          <LangSwitcher lang={lang} onChange={setLang} />
        </div>

        <h1 className="text-3xl font-black leading-tight tracking-tight text-[var(--text)] sm:text-4xl">
          {t.h1a}
          <br className="sm:hidden" />
          <span className="bg-gradient-to-r from-[var(--magenta)] via-pink-400 to-[var(--magenta)] bg-clip-text text-transparent">
            {t.h1b}
          </span>
        </h1>

        <p className="mx-auto max-w-xl text-base leading-relaxed text-[var(--text-muted)]">
          {t.sub}
        </p>

        <div className="flex flex-wrap justify-center gap-6 pt-2">
          {t.stats.map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-xl font-black text-[var(--magenta)]">{value}</p>
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[var(--magenta)]/40 to-transparent" />
      </section>

      {/* ── STEPS ── */}
      {t.steps.map((step, idx) => {
        const StepIcon = step.icon
        return (
          <section key={idx} className="space-y-8">
            <div className="flex items-start gap-4">
              <StepNumber n={idx + 1} />
              <div className="space-y-1">
                <SectionBadge>
                  <StepIcon size={10} />
                  {step.badge}
                </SectionBadge>
                <h2 className="mt-2 text-2xl font-black text-[var(--text)]">
                  <Nl text={step.title} />
                </h2>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-6">
              <p className="text-[var(--text-muted)] leading-relaxed">{step.desc}</p>

              {/* Cards */}
              {'cards' in step && step.cards.length > 0 && (
                <div className={`grid gap-4 ${step.cards.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
                  {step.cards.map((card) => (
                    <NeonCard
                      key={card.title}
                      icon={card.icon}
                      accent={card.accent}
                      title={card.title}
                      body={card.body}
                    />
                  ))}
                </div>
              )}

              {/* Timeline (STEP 1) */}
              {'timeline' in step && step.timeline && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                    {step.timeline.label}
                  </p>
                  {step.timeline.items.map(({ time, label }) => (
                    <div key={time} className="flex items-center gap-3 text-sm">
                      <span className="shrink-0 rounded-full bg-[var(--magenta)]/20 px-2.5 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
                        {time}
                      </span>
                      <span className="text-[var(--text-muted)]">{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Flow diagram (STEP 3) */}
              {'flow' in step && step.flow && (
                <div className="space-y-3">
                  {step.flow.map(({ icon: FlowIcon, title, body }, i) => (
                    <div key={i} className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--magenta)]/20 text-xs font-black text-[var(--magenta)]">
                        {i + 1}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <FlowIcon size={14} className="text-[var(--magenta)]" />
                          <p className="text-sm font-bold text-[var(--text)]">{title}</p>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CTA (STEP 3) */}
              {'cta' in step && step.cta && (
                <div className="text-center">
                  <Link
                    href={step.cta.href}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--magenta)]/40 px-6 py-2.5 text-sm font-semibold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/10"
                  >
                    <Brain size={14} />
                    {step.cta.label}
                  </Link>
                </div>
              )}
            </div>
          </section>
        )
      })}

      {/* ── DATA QUALITY ── */}
      <section>
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[var(--surface)] to-emerald-950/20 p-6 sm:p-8 space-y-5">
          <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-emerald-500/8 blur-3xl pointer-events-none" />
          <div className="relative space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-widest uppercase text-emerald-400">
              <BadgeCheck size={10} />
              {t.dq.badge}
            </span>
            <div>
              <h3 className="text-xl font-black text-[var(--text)]">{t.dq.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed max-w-xl">{t.dq.desc}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{t.dq.makers.label}</p>
              <div className="flex flex-wrap gap-2">
                {t.dq.makers.items.map((m) => (
                  <span key={m} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section className="space-y-8">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-black text-white shadow-[0_0_16px_rgba(16,185,129,0.45)]">
            <ShieldCheck size={18} />
          </div>
          <div className="space-y-1">
            <SectionBadge><ShieldCheck size={10} /> {t.sec.badge}</SectionBadge>
            <h2 className="mt-2 text-2xl font-black text-[var(--text)]">
              {t.sec.title}<br />
              <span className="text-[var(--text-muted)] text-lg font-semibold">{t.sec.sub}</span>
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-4">
          {t.sec.items.map(({ icon: SecIcon, color, bg, title, body }) => (
            <div key={title} className={`flex items-start gap-4 rounded-xl border p-5 ${bg}`}>
              <SecIcon size={20} className={`${color} mt-0.5 shrink-0`} />
              <div className="space-y-1">
                <p className={`text-sm font-bold ${color}`}>{title}</p>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER CTA ── */}
      <section className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--magenta)]/30 bg-gradient-to-br from-[var(--magenta)]/15 via-[var(--surface)] to-[var(--surface-2)] p-8 sm:p-12 text-center space-y-6">
          <div className="absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--magenta)]/20 blur-3xl pointer-events-none" />

          <div className="relative space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--magenta)]">
              {t.cta.eyebrow}
            </p>
            <h2 className="text-2xl font-black text-[var(--text)] sm:text-3xl">
              {t.cta.title}
            </h2>
            <p className="mx-auto max-w-sm text-sm text-[var(--text-muted)] leading-relaxed">
              <Nl text={t.cta.sub} />
            </p>
          </div>

          <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/verity/login"
              className="inline-flex w-full max-w-xs items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[var(--magenta)] to-pink-500 px-8 py-4 text-base font-black text-white shadow-[0_0_40px_rgba(226,0,116,0.5)] transition-all hover:brightness-110 hover:shadow-[0_0_56px_rgba(226,0,116,0.7)] active:scale-95 sm:w-auto"
            >
              <Sparkles size={16} className="shrink-0" />
              {t.cta.btn}
              <ArrowRight size={16} className="shrink-0" />
            </Link>
            <Link
              href="/verity"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              {t.cta.ghost}
              <ArrowRight size={13} />
            </Link>
          </div>

          <p className="relative text-[10px] text-[var(--text-muted)]">
            {t.cta.note}
          </p>
        </div>
      </section>

    </div>
  )
}
