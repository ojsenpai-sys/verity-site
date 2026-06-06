'use client'

import { useState, useEffect } from 'react'
import { X, CheckCircle2, UserPlus } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

const DISMISSED_KEY     = 'verity_notice_dismissed'
const NOTICE_VERSION    = '20260606'

const TEXTS = {
  ja: {
    badge: '重要なお知らせ',
    body:  'システム不具合による新規会員登録の復旧について：昨日よりマイページ登録およびSNSログインが正常に完了しない不具合が発生しておりましたが、現在は完全に復旧し、正常にご登録いただける状態となっております。大変ご迷惑をおかけいたしました。皆様のご登録を心よりお待ちしております。',
    cta:   '今すぐ無料登録 →',
  },
  en: {
    badge: 'Important Notice',
    body:  'Regarding the restoration of new member registration: A malfunction that prevented account registration and SNS login has been fully resolved. We sincerely apologize for the inconvenience caused. We warmly welcome all new registrations.',
    cta:   'Register Free Now →',
  },
  th: {
    badge: 'ประกาศสำคัญ',
    body:  'เกี่ยวกับการกู้คืนระบบลงทะเบียนสมาชิกใหม่: ระบบขัดข้องที่ทำให้ไม่สามารถลงทะเบียนและเข้าสู่ระบบผ่าน SNS ได้รับการแก้ไขเรียบร้อยแล้ว ขออภัยในความไม่สะดวก และยินดีต้อนรับสมาชิกใหม่ทุกท่าน',
    cta:   'ลงทะเบียนฟรี →',
  },
} as const

type Lang = keyof typeof TEXTS

export function SystemRestorationNotice() {
  const { user }              = useAuth()
  const [visible, setVisible] = useState(false)
  const [lang, setLang]       = useState<Lang>('ja')

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === NOTICE_VERSION) return
    } catch { /* private browsing */ }
    setVisible(true)

    const bl = navigator.language.toLowerCase()
    if      (bl.startsWith('th')) setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else                          setLang('ja')
  }, [])

  // ログイン済みユーザーには非表示
  if (user || !visible) return null

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, NOTICE_VERSION) } catch {}
    setVisible(false)
  }

  const t = TEXTS[lang]

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #110c00 0%, #1a1200 50%, #110c00 100%)',
        border:     '1px solid rgba(251,191,36,0.4)',
        padding:    '1rem 1.25rem',
      }}
    >
      {/* 上グロー */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.7), rgba(234,88,12,0.4), transparent)' }}
      />

      {/* 閉じるボタン */}
      <button
        onClick={dismiss}
        aria-label="閉じる"
        className="absolute right-3 top-3 rounded-full p-1 text-amber-500/50 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
      >
        <X size={14} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        {/* アイコン */}
        <CheckCircle2
          size={20}
          className="mt-0.5 shrink-0"
          style={{ color: '#fbbf24', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.5))' }}
        />

        <div className="flex-1 space-y-2">
          {/* バッジ ＋ タイトル */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-widest uppercase"
              style={{
                background: 'rgba(251,191,36,0.15)',
                border:     '1px solid rgba(251,191,36,0.4)',
                color:      '#fbbf24',
              }}
            >
              {t.badge}
            </span>
            <span
              className="text-[10px] font-semibold tracking-wider"
              style={{ color: 'rgba(251,191,36,0.5)' }}
            >
              SYSTEM RESTORED
            </span>
          </div>

          {/* 本文 */}
          <p
            className="text-xs leading-relaxed sm:text-[13px]"
            style={{ color: 'rgba(251,191,36,0.85)' }}
          >
            {t.body}
          </p>

          {/* CTA ボタン */}
          <a
            href="/verity/login?mode=signup"
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #b45309)' }}
          >
            <UserPlus size={12} className="shrink-0" />
            {t.cta}
          </a>
        </div>
      </div>

      {/* 下グロー */}
      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(234,88,12,0.4), transparent)' }}
      />
    </div>
  )
}
