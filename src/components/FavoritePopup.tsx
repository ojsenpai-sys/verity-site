'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Heart } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { getTotalFavCount } from '@/hooks/useFavorite'

const DISMISSED_KEY = 'verity_fav_popup_shown'

const TEXTS = {
  ja: {
    title:   'お気に入りに追加しました！',
    body:    'デバイス間での同期や、推しの最新情報を逃さずチェックするために、マイページであなたのニックネームを保存しませんか？',
    cta:     'マイページへ',
    dismiss: 'あとで',
  },
  en: {
    title:   'Favorites saved!',
    body:    'To sync across devices and stay updated on your favorites, please save your nickname in your My Page.',
    cta:     'Go to My Page',
    dismiss: 'Later',
  },
  th: {
    title:   'บันทึกรายการโปรดแล้ว!',
    body:    'เพื่อซิงค์ข้อมูลระหว่างอุปกรณ์ กรุณาบันทึกชื่อเล่นของคุณในหน้า มายเพจ',
    cta:     'ไปที่ มายเพจ',
    dismiss: 'ภายหลัง',
  },
} as const

type Lang = keyof typeof TEXTS

export function FavoritePopup() {
  const { user, loading } = useAuth()
  const [visible, setVisible] = useState(false)
  const [lang, setLang]       = useState<Lang>('ja')

  useEffect(() => {
    const bl = navigator.language.toLowerCase()
    if (bl.startsWith('th')) setLang('th')
    else if (bl.startsWith('en')) setLang('en')
    else setLang('ja')
  }, [])

  useEffect(() => {
    function handleFavAdded() {
      if (loading || user) return
      const count = getTotalFavCount()
      const shown = sessionStorage.getItem(DISMISSED_KEY)
      if (count >= 3 && !shown) setVisible(true)
    }

    window.addEventListener('verity:fav-added', handleFavAdded)
    return () => window.removeEventListener('verity:fav-added', handleFavAdded)
  }, [user, loading])

  function dismiss() {
    setVisible(false)
    sessionStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!visible) return null

  const t = TEXTS[lang]

  return (
    <div
      className="fixed bottom-6 right-4 z-50 w-[min(380px,calc(100vw-2rem))] animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label={t.title}
      style={{
        background:  'linear-gradient(145deg, #161624, #1e1e30)',
        border:      '1px solid rgba(226,0,116,0.45)',
        borderRadius:'1rem',
        boxShadow:   '0 0 40px rgba(226,0,116,0.18), 0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Heart size={15} style={{ fill: '#E20074', color: '#E20074', filter: 'drop-shadow(0 0 6px rgba(226,0,116,0.8))' }} />
            <h3 className="text-sm font-bold text-[var(--text)]">{t.title}</h3>
          </div>
          <button
            onClick={dismiss}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="閉じる"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.body}</p>

        <div className="flex gap-2 pt-1">
          <Link
            href="/verity/profile"
            onClick={dismiss}
            className="flex-1 rounded-lg py-2.5 text-center text-xs font-bold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #E20074, #ff2d55)',
              boxShadow:  '0 0 16px rgba(226,0,116,0.35)',
            }}
          >
            {t.cta}
          </Link>
          <button
            onClick={dismiss}
            className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--magenta)]/40 transition-colors"
          >
            {t.dismiss}
          </button>
        </div>
      </div>
    </div>
  )
}
