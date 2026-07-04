import Link from 'next/link'
import { CalendarDays, MapPin, ChevronRight, Sparkles } from 'lucide-react'
import { getAllEvents, resolveEventStatus } from '@/lib/events'

const STATUS_LABEL: Record<string, string> = {
  upcoming: '開催予定',
  live: '開催中',
  ended: '開催終了',
}

function jpDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00+09:00`)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/**
 * トップページ用「開催中イベント」カード。
 * 開催中(live)のイベントを優先、無ければ直近(newest)を1枚表示。
 * イベントが未定義なら何も描画しない（既存レイアウトに影響なし）。
 * config駆動・DBアクセスなし。
 */
export function EventHubCard() {
  const events = getAllEvents()
  if (events.length === 0) return null

  const live = events.find((e) => resolveEventStatus(e) === 'live')
  const event = live ?? events[0]
  const status = resolveEventStatus(event)

  return (
    <Link
      href={`/verity/events/${event.slug}`}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#c5a059]/30 bg-gradient-to-br from-[#c5a059]/[0.08] to-[var(--surface)] p-5 transition-all hover:border-[#c5a059]/60 hover:shadow-[0_0_28px_rgba(197,160,89,0.18)] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
    >
      {/* 装飾グロー */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{ background: 'radial-gradient(ellipse 60% 100% at 12% 50%, rgba(197,160,89,0.12) 0%, transparent 70%)' }}
      />

      <div className="relative flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c5a059]/40 bg-[#c5a059]/10 px-2.5 py-0.5 text-[9px] font-bold tracking-widest uppercase text-[#c5a059]">
            <Sparkles size={9} />
            VERITY Event Hub
          </span>
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
        </div>

        <h2 className="text-lg font-bold tracking-tight text-[var(--text)] transition-colors group-hover:text-[#c5a059]">
          {event.shortName ?? event.name}出演女優のX投稿・告知まとめ
        </h2>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={12} className="text-[#c5a059]/70" />
            {event.location}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={12} className="text-[#c5a059]/70" />
            {jpDate(event.startDate)}〜{jpDate(event.endDate)}
          </span>
        </div>
      </div>

      <span className="relative inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-[#b8960c] to-[#d4af37] px-4 py-2 text-[12px] font-bold text-[#0a0800] transition-all group-hover:brightness-110 sm:self-auto">
        特設ページを見る
        <ChevronRight size={13} />
      </span>
    </Link>
  )
}
