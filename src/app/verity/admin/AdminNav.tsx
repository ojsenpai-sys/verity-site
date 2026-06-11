'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Newspaper, FilePlus, Settings,
  Activity, ChevronRight, Radio, Search, Zap,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  exact?: boolean
  live?: boolean
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'コンテンツ管理',
    items: [
      { href: '/verity/admin',          label: 'CMS',         Icon: LayoutDashboard, exact: true },
      { href: '/verity/admin/news',     label: 'ニュース記事', Icon: Newspaper },
      { href: '/verity/admin/news/new', label: '新規作成',     Icon: FilePlus },
    ],
  },
  {
    title: 'インテリジェンス',
    items: [
      { href: '/verity/admin/dashboard', label: 'データ分析',  Icon: Activity, live: true },
      { href: '/verity/admin/realtime',  label: 'GA4 Debug',    Icon: Zap, live: true },
      { href: '/verity/admin/seo',       label: 'SEO改善ボード', Icon: Search },
    ],
  },
  {
    title: 'システム',
    items: [
      { href: '/verity/admin/settings', label: '設定', Icon: Settings },
    ],
  },
]

// Desktop sidebar nav items + mobile bottom bar
export default function AdminNav() {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <>
      {/* ── Desktop sidebar nav ─────────────────── */}
      <nav className="flex-1 py-4 px-2 space-y-5">
        {GROUPS.map((group, gi) => (
          <div key={group.title}>
            {gi > 0 && (
              <div
                className="mx-2 mb-4 h-px"
                style={{ background: 'rgba(170,255,0,0.08)' }}
              />
            )}
            <p
              className="mb-1 px-3 text-[9px] font-bold uppercase tracking-[0.15em]"
              style={{ color: 'rgba(170,255,0,0.45)' }}
            >
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, Icon, exact, live }) => {
                const active = isActive(href, exact)
                return (
                  <Link
                    key={href}
                    href={href}
                    className="group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all duration-150"
                    style={
                      active
                        ? {
                            background: 'rgba(170,255,0,0.1)',
                            color: '#aaff00',
                            boxShadow: 'inset 2px 0 0 #aaff00',
                          }
                        : { color: 'var(--text-muted)' }
                    }
                  >
                    <Icon size={15} />
                    <span className="flex-1">{label}</span>
                    {live && (
                      <span className="flex items-center gap-1">
                        <Radio
                          size={9}
                          style={{ color: active ? '#aaff00' : 'rgba(170,255,0,0.4)' }}
                        />
                      </span>
                    )}
                    {active && (
                      <ChevronRight
                        size={11}
                        style={{ color: '#aaff00', opacity: 0.7 }}
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Mobile bottom bar ───────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)] md:hidden"
      >
        {[
          GROUPS[0].items[0], // CMS
          GROUPS[0].items[1], // ニュース
          GROUPS[0].items[2], // 新規作成
          GROUPS[1].items[0], // データ分析
        ].map(({ href, label, Icon, exact }) => {
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-3 transition-colors"
              style={{ color: active ? '#aaff00' : 'var(--text-muted)' }}
            >
              <Icon size={18} />
              <span className="text-[9px]">{label}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
