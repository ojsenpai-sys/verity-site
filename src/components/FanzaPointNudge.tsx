import { Coins, ExternalLink, ArrowRight } from 'lucide-react'
import { withAffiliate } from '@/lib/affiliate'
import { FanzaLink } from './FanzaLink'

// FANZA ポイント確認ページ（アフィリエイト踏み台経由）
const FANZA_POINT_URL =
  withAffiliate('https://www.dmm.co.jp/my/-/point/') ??
  'https://www.dmm.co.jp/my/-/point/'

export function FanzaPointNudge() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-orange-400/30 bg-gradient-to-r from-[#1a0e00] via-[#1e1100] to-[#180d00]">
      {/* Accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-orange-500/70 via-amber-400/50 to-transparent" />

      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        {/* Icon + text */}
        <div className="flex items-start gap-3 sm:flex-1">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/20 ring-1 ring-orange-400/30">
            <Coins size={17} className="text-orange-400" />
          </div>
          <div>
            <p className="text-xs font-black tracking-wide text-orange-300">
              今月失効するFANZAポイントはありませんか？
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">
              ポイントの有効期限を確認して、余ったポイントは
              <a href="#fanza-100-sale" className="mx-0.5 font-bold text-orange-300 hover:underline">
                期間限定セール
              </a>
              や今週のおすすめ作品に使いましょう。
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href="#fanza-100-sale"
            className="flex items-center gap-1.5 rounded-full border border-orange-400/40 bg-orange-500/10 px-3.5 py-1.5 text-[11px] font-bold text-orange-300 transition-colors hover:bg-orange-500/20"
          >
            <ArrowRight size={11} />
            期間限定セールを見る
          </a>

          <FanzaLink
            href={FANZA_POINT_URL}
            targetId="fanza-point-check"
            position="point_nudge"
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-[0_0_12px_rgba(249,115,22,0.35)] transition-all hover:brightness-110 active:scale-[0.97]"
          >
            FANZAでポイント確認
            <ExternalLink size={10} />
          </FanzaLink>
        </div>
      </div>
    </div>
  )
}
