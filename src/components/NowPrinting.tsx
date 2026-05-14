export function NowPrinting({ className }: { className?: string }) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-2)] ${className ?? ''}`}
    >
      {/* Film-strip dots */}
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-2.5 w-1 rounded-sm bg-[var(--magenta)]/25" />
        ))}
      </div>
      <span className="select-none text-[9px] font-bold tracking-[0.22em] text-[var(--magenta)]/45 uppercase">
        NOW PRINTING
      </span>
    </div>
  )
}
