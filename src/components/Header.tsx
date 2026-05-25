'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Menu, X, Map, Newspaper, Users, LayoutDashboard, Sparkles } from 'lucide-react'
import { LoginButton } from './LoginButton'
import { useAuth } from './AuthProvider'

const NAV_LINKS = [
  { href: '/',             label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/verity/news',  label: '最新スケジュール', icon: Newspaper },
  { href: '/actresses',    label: 'Actresses',       icon: Users },
  { href: '/verity/guide', label: 'VERITYの遊び方',  icon: Map },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  // prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="group flex items-center" onClick={() => setIsOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/verity/logo.png.png"
              alt="VERITY"
              className="h-8 w-auto invert transition-all group-hover:drop-shadow-[0_0_10px_#E20074]"
            />
          </Link>

          {/* PC nav */}
          <nav className="hidden md:flex items-center gap-4 text-sm text-[var(--text-muted)]">
            <Link href="/" className="hover:text-[var(--magenta)] transition-colors">
              Dashboard
            </Link>
            <Link href="/verity/news" className="hover:text-[var(--magenta)] transition-colors">
              News
            </Link>
            <Link href="/actresses" className="hover:text-[var(--magenta)] transition-colors">
              Actresses
            </Link>
            <Link
              href="/verity/guide"
              className="flex items-center gap-1.5 rounded-full border border-[var(--magenta)]/40 px-3 py-1 text-xs font-semibold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/10"
            >
              <Map size={12} />
              VERITYの遊び方
            </Link>
            {user && (
              <Link
                href="/verity/mypage/concierge"
                className="flex items-center gap-1.5 rounded-full border border-purple-500/50 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300 transition-all hover:bg-purple-500/20 hover:border-purple-400/70 hover:shadow-[0_0_12px_rgba(168,85,247,0.3)]"
              >
                <Sparkles size={12} />
                あかりの部屋
              </Link>
            )}
            <LoginButton />
          </nav>

          {/* Mobile: hamburger button */}
          <button
            className="md:hidden flex items-center justify-center rounded-lg p-2 text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
            onClick={() => setIsOpen(v => !v)}
            aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl md:hidden transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-modal="true"
        role="dialog"
        aria-label="ナビゲーションメニュー"
      >
        <div className="flex flex-col h-full">
          {/* Drawer header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/verity/logo.png.png"
              alt="VERITY"
              className="h-7 w-auto invert"
            />
            <button
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
              aria-label="閉じる"
            >
              <X size={20} />
            </button>
          </div>

          {/* Nav links */}
          <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isGuide = href === '/verity/guide'
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all ${
                    isGuide
                      ? 'border border-[var(--magenta)]/30 bg-[var(--magenta)]/8 text-[var(--magenta)] hover:bg-[var(--magenta)]/15'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon size={16} className={isGuide ? 'text-[var(--magenta)]' : ''} />
                  {label}
                </Link>
              )
            })}
            {user && (
              <Link
                href="/verity/mypage/concierge"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 rounded-xl border border-purple-500/35 bg-purple-500/10 px-4 py-3.5 text-sm font-bold text-purple-300 transition-all hover:bg-purple-500/18 hover:border-purple-400/55"
              >
                <Sparkles size={16} className="text-purple-300" />
                あかりの部屋（AI対話）
              </Link>
            )}
          </nav>

          {/* Login / Mypage at bottom */}
          <div className="p-5 border-t border-[var(--border)]">
            <div onClick={() => setIsOpen(false)} className="w-full">
              <LoginButton />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
