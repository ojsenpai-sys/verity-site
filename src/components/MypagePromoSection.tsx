import Link from 'next/link'
import { Heart, Bell, Trophy, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TrackedLink } from '@/app/verity/actresses/[id]/TrackedLink'

const FEATURES = [
  { icon: Heart,  label: 'お気に入り女優を保存' },
  { icon: Bell,   label: '最新作をメールでお知らせ' },
  { icon: Trophy, label: '週間ランキング更新を通知' },
  { icon: Star,   label: 'お気に入り作品をマイページで管理' },
] as const

function FeatureGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {FEATURES.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-center"
        >
          <Icon size={18} className="text-[var(--magenta)]" />
          <p className="text-[11px] leading-snug text-[var(--text)]">{label}</p>
        </div>
      ))}
    </div>
  )
}

export async function MypagePromoSection() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="mx-auto max-w-2xl space-y-5 text-center">
          <div>
            <h2 className="text-lg font-black leading-snug text-[var(--text)] sm:text-xl">
              VERITYをもっと便利に。<br className="sm:hidden" />無料マイページをはじめよう。
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              お気に入り女優を登録すると、最新作が届いたときにメールでお知らせ。<br className="hidden sm:block" />
              毎週更新されるVERITY週間ランキングの通知も受け取れます。
            </p>
          </div>

          <FeatureGrid />

          <div className="space-y-2">
            <TrackedLink
              href="/verity/login?mode=signup&next=/verity/profile"
              eventName="signup_start"
              payload={{ position: 'home_mypage_promo' }}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-7 py-2.5 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.30)] transition-all hover:brightness-110 active:scale-[0.97]"
            >
              無料でマイページを作る
            </TrackedLink>
            <p className="text-[11px] text-[var(--text-muted)]">登録無料・通知はいつでもOFFにできます</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        <div>
          <h2 className="text-lg font-black leading-snug text-[var(--text)] sm:text-xl">
            VERITYをもっと自分好みに。
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            お気に入り女優の新作通知やVERITY週間ランキングの更新通知は、<br className="hidden sm:block" />
            マイページの通知設定からいつでも変更できます。
          </p>
        </div>

        <FeatureGrid />

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link
            href="/verity/profile"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-7 py-2.5 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.30)] transition-all hover:brightness-110 active:scale-[0.97]"
          >
            マイページを見る
          </Link>
          <Link href="/verity/actresses" className="text-xs text-[var(--magenta)] hover:underline">
            お気に入り女優を追加 →
          </Link>
        </div>
      </div>
    </section>
  )
}
