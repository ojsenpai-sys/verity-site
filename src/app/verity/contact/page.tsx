import type { Metadata } from 'next'
import { Mail, Camera, MessageSquarePlus } from 'lucide-react'
import { SuggestionForm } from '@/components/SuggestionForm'
import { ContactForm } from '@/components/ContactForm'

export const metadata: Metadata = {
  title: 'お問い合わせ / Contact — VERITY',
  description: 'タイアップ企画・広告出稿・取材依頼はこちらからご連絡ください。',
}

// Formspree endpoint — set CONTACT_FORM_ENDPOINT in your deployment env.
// 1. Create a form at https://formspree.io/ configured to forward to info.mizutamari48@gmail.com
// 2. Copy the form endpoint (https://formspree.io/f/XXXXXXXX) and set it as CONTACT_FORM_ENDPOINT
const FORM_ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_FORM_ENDPOINT ?? 'https://formspree.io/f/YOUR_ID'

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-14">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--magenta)]/30
                        bg-[var(--magenta)]/10 px-4 py-1.5">
          <Mail size={13} className="text-[var(--magenta)]" />
          <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--magenta)]">
            Contact / お問い合わせ
          </span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]">
          タイアップ・広告出稿のご相談
        </h1>

        <div className="h-px bg-gradient-to-r from-[var(--magenta)]/40 via-[var(--border)] to-transparent" />

        <p className="leading-relaxed text-[var(--text-muted)]">
          VERITYでは、各メーカー様・プロダクション様からのタイアップ企画や広告出稿を承っております。
          第一線で活躍してきたプロのインタビュアーによる深掘り取材を通じ、女優の新たな魅力や作品の背景にあるストーリーを
          質の高いテキストでお届けします。独占インタビュー記事の企画制作、バナー出稿など、お気軽にご相談ください。
        </p>

        {/* Interactive cards + form (client component) */}
        <ContactForm formEndpoint={FORM_ENDPOINT} />
      </div>

      {/* ── ご意見箱 ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <MessageSquarePlus size={18} className="text-[var(--magenta)]" />
            <h2 className="text-lg font-bold text-[var(--text)]">ご意見箱 — 推薦リクエスト</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            アナタが推薦したい女優・作品を教えてください。編集部が審査し、VERITYへの掲載を検討します。
          </p>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <SuggestionForm />
      </div>

      {/* ── 取材受付 ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-4">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-[var(--magenta)]" />
          <h2 className="text-lg font-bold text-[var(--text)]">取材受付</h2>
        </div>
        <div className="h-px bg-[var(--border)]" />
        <p className="leading-relaxed text-[var(--text-muted)]">
          店舗イベント、撮影現場などの取材・掲載依頼を承っております。
          プロのライターによる質の高いレポートを公式に発信いたします。
          ご依頼は{' '}
          <a
            href="mailto:info.mizutamari48@gmail.com"
            className="text-[var(--magenta)] hover:underline"
          >
            info.mizutamari48@gmail.com
          </a>
          {' '}まで。
        </p>
      </div>

      {/* ── Company info ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">運営会社</p>
        <p className="font-bold text-[var(--text)]">合同会社VERITY</p>
        <p className="text-sm text-[var(--text-muted)]">
          お急ぎの方は{' '}
          <a
            href="mailto:info.mizutamari48@gmail.com"
            className="text-[var(--magenta)] hover:underline"
          >
            info.mizutamari48@gmail.com
          </a>
          {' '}まで直接ご連絡ください。
        </p>
      </div>

    </div>
  )
}
