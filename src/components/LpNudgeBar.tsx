import Link from 'next/link'
import { Gift, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export async function LpNudgeBar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <Link href="/verity/login?next=/verity/profile" className="block">
        <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-r from-[#120d00] via-[#1c1500] to-[#0e0a00] transition-all hover:brightness-110 active:scale-[0.99]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-amber-500/80 via-yellow-400/50 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-amber-500/40 to-transparent" />
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5 sm:py-4">
            <div className="flex items-start gap-3 sm:flex-1">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-400/30">
                <Gift size={16} className="text-amber-400" />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-sm bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-amber-400 ring-1 ring-amber-400/30">
                    6月限定
                  </span>
                  <span className="inline-flex items-center rounded-sm bg-yellow-400/10 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-yellow-400/80 ring-1 ring-yellow-400/20">
                    CAMPAIGN
                  </span>
                </div>
                <p className="text-xs font-black tracking-wide text-amber-200">
                  🎁 今すぐ無料登録で『30 LP』プレゼントキャンペーン実施中！
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">
                  推しの女優を応援して、限定称号を手に入れよう。登録・利用は永久無料。
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-600 to-yellow-500 px-5 py-2 text-[12px] font-black text-white shadow-[0_0_16px_rgba(217,119,6,0.35)]">
                無料登録して特典を受け取る ▶
              </span>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('lp_balance, login_streak')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return null

  const lp     = (profile.lp_balance     as number | null) ?? 0
  const streak = (profile.login_streak   as number | null) ?? 0

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--magenta)]/30 bg-[var(--magenta)]/10 px-3 py-1 text-[11px] font-bold text-[var(--magenta)]">
        💙 {lp.toLocaleString()} LP 保有中
      </span>
      {streak >= 2 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold text-orange-300">
          <Flame size={10} />
          {streak}日連続ログイン継続中
        </span>
      )}
      <span className="ml-auto text-[10px] text-[var(--text-muted)]">
        FANZAリンクをクリックするとLPが貯まります
      </span>
    </div>
  )
}
