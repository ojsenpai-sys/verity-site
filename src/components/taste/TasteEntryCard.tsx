import { Sparkles, ArrowRight } from 'lucide-react'
import { TrackedLink } from '@/app/verity/actresses/[id]/TrackedLink'

/**
 * トップページ用のTaste Check導入CTA。Heroやランキング等の既存主要導線を
 * 差し替えず、小さめのfeature cardとして挿入する（実験段階の入口として扱う）。
 */
export function TasteEntryCard() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--magenta)]/25 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--magenta)]/60 via-purple-400/30 to-transparent" />
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-purple-600">
              <Sparkles size={13} className="text-white" />
            </span>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[var(--magenta)]">
              NEW
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">
              VERITY Taste Check
            </p>
          </div>
          <h2 className="text-base font-black leading-snug text-[var(--text)] sm:text-lg">
            選ぶだけで、あなたの&ldquo;好き&rdquo;が見えてくる。
          </h2>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            20作品を直感で選んで、あなたに合いそうな作品と女優を見つけよう。
          </p>
        </div>

        <TrackedLink
          href="/verity/taste"
          eventName="taste_entry_click"
          payload={{ position: 'home_taste_entry' }}
          className="flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-6 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.3)] transition-all hover:brightness-110 active:scale-[0.97]"
        >
          好みを診断する
          <ArrowRight size={15} />
        </TrackedLink>
      </div>
    </section>
  )
}
