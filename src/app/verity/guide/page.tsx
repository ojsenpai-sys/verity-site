import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Zap, BookOpen, Brain, ShieldCheck,
  ArrowRight, Star, Clock, Sparkles,
  Lock, UserCheck, Database,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'VERITYの遊び方 — 30秒でわかる次世代エンタメの嗜み方',
  description:
    'FANZA公式データ直結の最新作チェック、編集長厳選コーナー、大人の属性カルテ——VERITYを120%楽しむための完全ガイド。',
}

// ─── 共通ユーティリティ ────────────────────────────────────────────────────

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-3 py-1 text-[11px] font-bold tracking-widest uppercase text-[var(--magenta)]">
      {children}
    </span>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)] to-[var(--magenta-dim)] text-sm font-black text-white shadow-[0_0_16px_rgba(226,0,116,0.45)]">
      {n}
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  accent = 'magenta',
}: {
  icon: React.ElementType
  title: string
  body: string
  accent?: 'magenta' | 'emerald' | 'sky' | 'amber'
}) {
  const colors = {
    magenta: 'border-[var(--magenta)]/30 bg-[var(--magenta)]/8 text-[var(--magenta)]',
    emerald: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-400',
    sky:     'border-sky-500/30 bg-sky-500/8 text-sky-400',
    amber:   'border-amber-500/30 bg-amber-500/8 text-amber-400',
  }
  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${colors[accent]}`}>
      <Icon size={22} />
      <p className="font-bold text-[var(--text)]">{title}</p>
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">{body}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-24">

      {/* ══════════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-6 text-center">
        <SectionBadge>
          <Sparkles size={10} />
          How to VERITY
        </SectionBadge>

        <h1 className="text-3xl font-black leading-tight tracking-tight text-[var(--text)] sm:text-4xl">
          30秒でわかる、<br className="sm:hidden" />
          <span className="bg-gradient-to-r from-[var(--magenta)] via-pink-400 to-[var(--magenta)] bg-clip-text text-transparent">
            次世代大人のエンタメメディア
          </span><br />
          『VERITY』の嗜み方
        </h1>

        <p className="mx-auto max-w-xl text-base leading-relaxed text-[var(--text-muted)]">
          FANZA公式データと直結し、女優・作品・同人コミックを横断する
          国内唯一のキュレーション体験。4つのステップで、あなたの「推し」が見つかります。
        </p>

        {/* mini stat bar */}
        <div className="flex flex-wrap justify-center gap-6 pt-2">
          {[
            { label: '女優データ',   value: '1,100名+' },
            { label: '作品数',       value: '毎日更新' },
            { label: '利用料金',     value: '完全無料' },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-xl font-black text-[var(--magenta)]">{value}</p>
              <p className="text-[11px] text-[var(--text-muted)] tracking-wide">{label}</p>
            </div>
          ))}
        </div>

        {/* divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-[var(--magenta)]/40 to-transparent" />
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          STEP 1: 最速新着
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-8">
        <div className="flex items-start gap-4">
          <StepNumber n={1} />
          <div className="space-y-1">
            <SectionBadge><Zap size={10} /> 最速チェック</SectionBadge>
            <h2 className="mt-2 text-2xl font-black text-[var(--text)]">
              最速新着をチェックする
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-6">
          <p className="text-[var(--text-muted)] leading-relaxed">
            VERITYはFANZA公式APIと直結。毎日リアルタイムで最新作・予約作スケジュールが更新されます。
            「今日発売の新作」「来週予約解禁の先行タイトル」を、どのメディアよりも早くキャッチできます。
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={Clock}
              accent="sky"
              title="【最速】予約・先行公開"
              body="発売前の作品をいち早く把握。予約解禁と同時に動けます。"
            />
            <FeatureCard
              icon={Star}
              accent="magenta"
              title="人気女優 Top 100"
              body="FANZA月間ランキング上位の旬な女優の最新作のみを優先表示。ノイズゼロ。"
            />
          </div>

          {/* visual hint — timeline */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              VERITYの更新サイクル（例）
            </p>
            {[
              { time: '毎日 0:00 JST', label: '最新作・予約作を自動同期' },
              { time: '毎日 6:00 JST', label: '人気女優ランキングを更新' },
              { time: 'リアルタイム',  label: '編集長厳選コンテンツを随時追加' },
            ].map(({ time, label }) => (
              <div key={time} className="flex items-center gap-3 text-sm">
                <span className="shrink-0 rounded-full bg-[var(--magenta)]/20 px-2.5 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
                  {time}
                </span>
                <span className="text-[var(--text-muted)]">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          STEP 2: 編集長厳選
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-8">
        <div className="flex items-start gap-4">
          <StepNumber n={2} />
          <div className="space-y-1">
            <SectionBadge><BookOpen size={10} /> 編集長厳選</SectionBadge>
            <h2 className="mt-2 text-2xl font-black text-[var(--text)]">
              編集長厳選コーナーを読み込む
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-6">
          <p className="text-[var(--text-muted)] leading-relaxed">
            アルゴリズムでは拾えない「センス」を届けるのがVERITY編集部の仕事。
            実写動画・DVD・同人コミックを横断した「目利き」コンテンツを厳選して掲載しています。
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={Zap}
              accent="sky"
              title="動画配信"
              body="Blue badge。最高画質でいますぐ視聴できるデジタル配信作品。"
            />
            <FeatureCard
              icon={Star}
              accent="amber"
              title="DVD / Blu-ray"
              body="Orange badge。コレクターズアイテムとしてのパッケージ版。"
            />
            <FeatureCard
              icon={BookOpen}
              accent="emerald"
              title="推薦コミック"
              body="Green badge。編集長が厳選した同人コミックの珠玉の一冊。"
            />
          </div>

          {/* call out the comic section */}
          <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-5">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl" />
            <div className="relative space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-emerald-400" />
                <span className="text-sm font-bold text-emerald-400">VERITY推薦！新作コミック</span>
                <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                  編集長厳選
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                伊達ろく先生など気鋭の作家による同人コミックを、編集長が直接手で選んでお届け。
                アルゴリズムには絶対に出せない「センス」の領域。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          STEP 3: 大人の属性カルテ
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-8">
        <div className="flex items-start gap-4">
          <StepNumber n={3} />
          <div className="space-y-1">
            <SectionBadge><Brain size={10} /> マイページ</SectionBadge>
            <h2 className="mt-2 text-2xl font-black text-[var(--text)]">
              あなたの好みを暴く<br />
              <span className="text-[var(--magenta)]">『大人の属性カルテ』</span>
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-6">
          <p className="text-[var(--text-muted)] leading-relaxed">
            VERITYの真骨頂はここにあります。お気に入り登録した女優・作品のデータをもとに、
            独自アルゴリズムが「あなたの性癖の傾向」を徹底解析。
            称号と「今夜の運命の1本」を導き出します。
          </p>

          {/* flow diagram */}
          <div className="space-y-3">
            {[
              {
                step: '1',
                icon: Star,
                title: 'お気に入り登録',
                body: '気になる女優・作品をポチるだけ。登録すればするほど精度が上がります。',
              },
              {
                step: '2',
                icon: Brain,
                title: 'VERITYが成分解析',
                body: '登録データからジャンル・タグ・女優の傾向を自動解析。',
              },
              {
                step: '3',
                icon: Sparkles,
                title: '称号と推薦作を受け取る',
                body: '「○○系紳士」などのユニーク称号と、今夜観るべき1本が表示されます。',
              },
            ].map(({ step, icon: Icon, title, body }) => (
              <div key={step} className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--magenta)]/20 text-xs font-black text-[var(--magenta)]">
                  {step}
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-[var(--magenta)]" />
                    <p className="text-sm font-bold text-[var(--text)]">{title}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/verity/profile"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--magenta)]/40 px-6 py-2.5 text-sm font-semibold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/10"
            >
              <Brain size={14} />
              マイページを見てみる
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          STEP 4: 安心・安全宣言
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-8">
        <div className="flex items-start gap-4">
          <StepNumber n={4} />
          <div className="space-y-1">
            <SectionBadge><ShieldCheck size={10} /> 安心・安全</SectionBadge>
            <h2 className="mt-2 text-2xl font-black text-[var(--text)]">
              【安心・安全宣言】<br />
              <span className="text-[var(--text-muted)] text-lg font-semibold">
                登録をためらっているあなたへ
              </span>
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-4">
          {[
            {
              icon: UserCheck,
              title: '完全匿名・永久無料',
              body: 'メールアドレス（またはGoogleアカウント）だけで登録完了。氏名・住所・クレジットカードは一切不要です。料金は永久に0円。',
              color: 'text-emerald-400',
              bg:   'border-emerald-500/25 bg-emerald-500/8',
            },
            {
              icon: Lock,
              title: 'SNS連携ゼロ・身バレ100%なし',
              body: 'VERITYはあなたのSNSと連携しません。お気に入り登録・閲覧履歴がTwitter/Instagramのフォロワーに知られることは絶対にありません。',
              color: 'text-sky-400',
              bg:   'border-sky-500/25 bg-sky-500/8',
            },
            {
              icon: Database,
              title: '世界基準のセキュリティで暗号化保護',
              body: '認証データはSupabase（PostgreSQL + RLS）により厳重に暗号化・保護されています。業界標準のJWT認証を採用し、あなたの情報は第三者に一切渡りません。',
              color: 'text-amber-400',
              bg:   'border-amber-500/25 bg-amber-500/8',
            },
          ].map(({ icon: Icon, title, body, color, bg }) => (
            <div key={title} className={`flex items-start gap-4 rounded-xl border p-5 ${bg}`}>
              <Icon size={20} className={`${color} mt-0.5 shrink-0`} />
              <div className="space-y-1">
                <p className={`text-sm font-bold ${color}`}>{title}</p>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER CTA
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--magenta)]/30 bg-gradient-to-br from-[var(--magenta)]/15 via-[var(--surface)] to-[var(--surface-2)] p-8 sm:p-12 text-center space-y-6">
          {/* bg glow */}
          <div className="absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--magenta)]/20 blur-3xl pointer-events-none" />

          <div className="relative space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--magenta)]">
              Join VERITY — Free Forever
            </p>
            <h2 className="text-2xl font-black text-[var(--text)] sm:text-3xl">
              さあ、あなたの「推し」を<br className="sm:hidden" />見つけよう
            </h2>
            <p className="mx-auto max-w-sm text-sm text-[var(--text-muted)] leading-relaxed">
              登録30秒・完全無料・身バレなし。<br />
              会員限定の「大人の属性カルテ」で、今夜の1本が変わります。
            </p>
          </div>

          <div className="relative flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/verity/login"
              className="inline-flex w-full max-w-xs items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[var(--magenta)] to-pink-500 px-8 py-4 text-base font-black text-white shadow-[0_0_40px_rgba(226,0,116,0.5)] transition-all hover:brightness-110 hover:shadow-[0_0_56px_rgba(226,0,116,0.7)] active:scale-95 sm:w-auto"
            >
              <Sparkles size={16} className="shrink-0" />
              無料で今すぐ始める
              <ArrowRight size={16} className="shrink-0" />
            </Link>
            <Link
              href="/verity"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              まずはトップページへ
              <ArrowRight size={13} />
            </Link>
          </div>

          <p className="relative text-[10px] text-[var(--text-muted)]">
            ※ クレジットカード不要・個人情報（氏名・住所）の入力なし
          </p>
        </div>
      </section>

    </div>
  )
}
