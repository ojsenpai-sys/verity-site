'use client'

type Props = {
  current: number // 1-indexed
  total: number
}

export function TasteProgress({ current, total }: Props) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <div className="flex items-center gap-3 px-4 pt-4 sm:px-0">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--magenta)] to-[#ff6eb4] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--text-muted)]">
        {current} / {total}
      </span>
    </div>
  )
}
