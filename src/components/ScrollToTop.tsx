'use client'

import { useEffect, useState } from 'react'
import { ChevronUp } from 'lucide-react'

const SHOW_THRESHOLD = 400

export function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_THRESHOLD)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="トップへ戻る"
      className={`fixed bottom-8 right-8 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-lg transition-all duration-300 hover:border-[var(--magenta)] hover:text-[var(--magenta)] hover:shadow-[0_0_16px_rgba(226,0,116,0.3)] ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <ChevronUp size={18} />
    </button>
  )
}
