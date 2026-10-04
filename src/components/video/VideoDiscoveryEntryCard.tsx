import Link from 'next/link'
import { ArrowRight, Play } from 'lucide-react'

/**
 * トップページ用の VIDEO DISCOVERY 入口（TasteEntryCard と同じ小さめ feature card）。
 * トップには動画棚を置かず、まず専用ページ（/verity/videos）への利用率を計測する。
 * 入口経由は ?from=home を付け、遷移先の video_catalog_impression の metadata.entry で識別する
 * （入口クリック専用の新イベントは作らない）。
 */
export function VideoDiscoveryEntryCard() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--magenta)]/25 bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] p-5 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--magenta)]/60 via-rose-400/30 to-transparent" />
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-rose-600">
              <Play size={12} className="fill-white text-white" />
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--text-muted)]">
              VIDEO DISCOVERY
            </p>
          </div>
          <h2 className="text-base font-black leading-snug text-[var(--text)] sm:text-lg">
            気になる作品を、まず見て探す。
          </h2>
          <p className="text-sm leading-relaxed text-[var(--text-muted)]">
            新着・人気作品のサンプル動画をその場でチェック。
          </p>
        </div>

        <Link
          href="/verity/videos?from=home"
          className="flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-6 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.3)] transition-all hover:brightness-110 active:scale-[0.97]"
        >
          動画から作品を探す
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  )
}
