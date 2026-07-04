export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { Sparkles, MapPin, CalendarDays, ChevronRight } from 'lucide-react'
import { getAllEvents, resolveEventStatus } from '@/lib/events'

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export const metadata = {
  title: 'イベントハブ | VERITY',
  description:
    'リアルイベントに合わせて出演女優のX投稿と関連作品をまとめる VERITY のイベント特設コーナー一覧。',
  alternates: { canonical: `${BASE}/verity/events` },
}

const STATUS_LABEL: Record<string, string> = {
  upcoming: '開催予定',
  live: '開催中',
  ended: '開催終了',
}

function jpDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function EventsListPage() {
  const events = getAllEvents()

  return (
    <div className="min-h-screen bg-[#0a0800]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <nav className="mb-5 flex items-center gap-1 text-[10px] text-[#d4af37]/40">
          <Link href="/verity" className="hover:text-[#d4af37]/70 transition-colors">VERITY</Link>
          <ChevronRight size={10} />
          <span className="text-[#d4af37]/60">Events</span>
        </nav>

        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold tracking-widest uppercase text-[#d4af37]">
          <Sparkles size={10} />
          VERITY Event Hub
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-[#d4af37]">
          イベントハブ
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
          リアルイベントに合わせて、出演女優のX投稿と関連作品を VERITY 内でまとめる特設コーナー。
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {events.map((event) => {
            const status = resolveEventStatus(event)
            return (
              <Link
                key={event.slug}
                href={`/verity/events/${event.slug}`}
                className="group flex flex-col gap-3 rounded-2xl border border-[#d4af37]/20 bg-black/40 p-5 transition-all hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-[0_0_28px_rgba(212,175,55,0.15)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold tracking-wider ${
                      status === 'live'
                        ? 'border border-red-500/50 bg-red-500/15 text-red-300'
                        : status === 'upcoming'
                        ? 'border border-sky-500/40 bg-sky-500/10 text-sky-300'
                        : 'border border-white/15 bg-white/5 text-white/40'
                    }`}
                  >
                    {status === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
                    {STATUS_LABEL[status]}
                  </span>
                  {event.shortName && (
                    <span className="text-[10px] font-bold text-[#d4af37]/50">{event.shortName}</span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-white/85 transition-colors group-hover:text-[#d4af37]">
                  {event.name}
                </h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={12} className="text-[#d4af37]/60" />
                    {event.location}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={12} className="text-[#d4af37]/60" />
                    {jpDate(event.startDate)}〜{jpDate(event.endDate)}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11px] leading-relaxed text-white/40">
                  {event.description}
                </p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
