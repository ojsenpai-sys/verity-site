'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Heart, Zap, Star, Crown, Tag } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

const BENEFIT_ICONS = [Heart, Zap, Star, Crown] as const

const TEXTS = {
  ja: {
    badge:    '完全無料 · 10秒で完了',
    title:    'Profiles登録が必要です',
    body:     'お気に入り機能・マイページを使うには、無料の Profiles 登録をお済ませください。',
    benefits: [
      '推し女優をお気に入り登録してLPをプレゼント',
      'ログインボーナスで毎日LPをゲット',
      '称号・二つ名コレクションを解放',
      '成分解析・運命の1本レコメンド',
    ] as string[],
    blackTeaser: '月額500円の VERITY BLACK で枠をさらに拡張できます',
    cta:     '今すぐ無料登録',
    login:   'すでに登録済みの方はこちら',
    dismiss: 'あとで',
  },
  en: {
    badge:    'Free · Takes 10 seconds',
    title:    'Sign in required',
    body:     'Please register a free Profiles account to use favorites and My Page.',
    benefits: [
      'Add favorite actresses and give them LP',
      'Earn daily LP with login bonuses',
      'Unlock titles and epithets',
      'Get genre analysis & destiny picks',
    ] as string[],
    blackTeaser: 'Expand your slots further with VERITY BLACK (¥500/mo)',
    cta:     'Register for free',
    login:   'Already have an account?',
    dismiss: 'Later',
  },
  th: {
    badge:    'ฟรี · ใช้เวลา 10 วินาที',
    title:    'ต้องลงทะเบียนก่อน',
    body:     'กรุณาลงทะเบียน Profiles ฟรีเพื่อใช้งานรายการโปรดและ My Page',
    benefits: [
      'เพิ่มนักแสดงโปรดและให้ LP',
      'รับ LP ทุกวันจากโบนัสเข้าสู่ระบบ',
      'ปลดล็อกตำแหน่งและฉายา',
      'วิเคราะห์แนวเรื่องและแนะนำหนัง',
    ] as string[],
    blackTeaser: 'ขยายช่องเพิ่มเติมด้วย VERITY BLACK (¥500/เดือน)',
    cta:     'ลงทะเบียนฟรี',
    login:   'มีบัญชีแล้วหรือเปล่า?',
    dismiss: 'ทีหลัง',
  },
} as const

type Lang = keyof typeof TEXTS

const SALE_TEXTS = {
  ja: { label: '100円セール対象作品リストを今すぐチェック！', tag: '100円セール中' },
  en: { label: 'Unlock the ¥100 Sale full list right now!',  tag: '¥100 Sale' },
  th: { label: 'ดูรายการเซลล์ 100 เยนได้ทันที!',           tag: 'เซลล์ 100 เยน' },
} as const

export function LoginPromptModal() {
  const { user }                    = useAuth()
  const [visible,    setVisible]    = useState(false)
  const [returnPath, setReturnPath] = useState('/verity/profile')
  const [lang,       setLang]       = useState<Lang>('ja')
  const [isSaleCtx,  setIsSaleCtx]  = useState(false)

  useEffect(() => {
    const bl = navigator.language.toLowerCase()
    if (bl.startsWith('th'))     setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else                          setLang('ja')
  }, [])

  useEffect(() => {
    function handleAuthRequired(e: Event) {
      if (user) return
      const ctx = (e as CustomEvent<{ ctx?: string }>).detail?.ctx
      setIsSaleCtx(ctx === 'sale100')
      setReturnPath(window.location.pathname + window.location.search)
      setVisible(true)
    }
    window.addEventListener('verity:auth-required', handleAuthRequired)
    return () => window.removeEventListener('verity:auth-required', handleAuthRequired)
  }, [user])

  function dismiss() {
    setVisible(false)
    setIsSaleCtx(false)
  }

  if (!visible || user) return null

  const t          = TEXTS[lang]
  const st         = SALE_TEXTS[lang]
  const loginHref  = `/verity/login?next=${encodeURIComponent(returnPath)}`
  const signupHref = `/verity/login?mode=signup&next=${encodeURIComponent(returnPath)}`

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={dismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0f0f1c 0%, #161628 60%, #1a1020 100%)',
          border:     '1px solid rgba(226,0,116,0.4)',
          boxShadow:  '0 0 60px rgba(226,0,116,0.18), 0 0 120px rgba(80,0,200,0.1), 0 24px 80px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 上部グロー装飾 */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(226,0,116,0.7), transparent)' }}
        />

        <div className="p-6 space-y-5">
          {/* ヘッダー */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                style={{
                  background: 'rgba(226,0,116,0.15)',
                  border:     '1px solid rgba(226,0,116,0.35)',
                  color:      '#E20074',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: '#E20074', boxShadow: '0 0 4px #E20074' }}
                />
                {t.badge}
              </span>
              <h2
                className="text-base font-bold leading-tight"
                style={{ color: 'var(--text)' }}
              >
                {t.title}
              </h2>
            </div>
            <button
              onClick={dismiss}
              className="shrink-0 rounded-full p-1 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="閉じる"
            >
              <X size={16} />
            </button>
          </div>

          {/* 説明文 */}
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {t.body}
          </p>

          {/* ベネフィット一覧 */}
          <ul className="space-y-2">
            {t.benefits.map((benefit, i) => {
              const Icon = BENEFIT_ICONS[i]
              return (
                <li key={i} className="flex items-center gap-2.5">
                  <span
                    className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      background: 'rgba(226,0,116,0.12)',
                      border:     '1px solid rgba(226,0,116,0.25)',
                    }}
                  >
                    <Icon size={11} style={{ color: '#E20074' }} />
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>
                    {benefit}
                  </span>
                </li>
              )
            })}
          </ul>

          {/* 100円セールコンテキスト — バナー経由のみ表示 */}
          {isSaleCtx && (
            <div
              className="rounded-xl px-3.5 py-2.5 flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(234,88,12,0.1))',
                border:     '1px solid rgba(251,191,36,0.4)',
              }}
            >
              <Tag size={12} style={{ color: '#fbbf24', flexShrink: 0 }} />
              <div className="space-y-0.5">
                <span
                  className="block text-[9px] font-black tracking-widest uppercase"
                  style={{ color: '#fbbf24' }}
                >
                  {st.tag}
                </span>
                <p className="text-[11px] leading-snug font-semibold" style={{ color: 'rgba(251,191,36,0.9)' }}>
                  {st.label}
                </p>
              </div>
            </div>
          )}

          {/* VERITY BLACK ティーザー */}
          <div
            className="rounded-xl px-3.5 py-2.5 flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg, rgba(80,0,160,0.25), rgba(30,0,60,0.4))',
              border:     '1px solid rgba(130,80,255,0.3)',
            }}
          >
            <Crown size={12} style={{ color: '#9b6dff', flexShrink: 0 }} />
            <p className="text-[11px] leading-snug" style={{ color: 'rgba(180,150,255,0.9)' }}>
              {t.blackTeaser}
            </p>
          </div>

          {/* CTA ボタン */}
          <div className="space-y-2 pt-1">
            <Link
              href={signupHref}
              onClick={dismiss}
              className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #E20074, #ff2d55)',
                boxShadow:  '0 0 20px rgba(226,0,116,0.45), 0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              {t.cta}
            </Link>
            <Link
              href={loginHref}
              onClick={dismiss}
              className="flex w-full items-center justify-center rounded-xl py-2.5 text-xs transition-colors"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                color:  'var(--text-muted)',
              }}
            >
              {t.login}
            </Link>
          </div>
        </div>

        {/* 下部グロー装飾 */}
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(130,80,255,0.4), transparent)' }}
        />
      </div>
    </div>
  )
}
