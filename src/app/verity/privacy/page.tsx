import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: 'プライバシーポリシー — VERITY',
  description: 'VERITYにおける個人情報の収集・利用・管理方針について説明します。',
  robots: { index: true, follow: true },
}

type Section = {
  number: string
  title:  string
  body:   React.ReactNode
}

const SECTIONS: Section[] = [
  {
    number: '①',
    title:  '収集する情報と利用目的',
    body: (
      <>
        <p className="text-sm leading-relaxed text-[var(--text-muted)] mb-4">
          当サービスでは、サービスの提供・向上のために以下の情報を収集・利用します。
        </p>
        <ul className="space-y-3">
          {[
            {
              term: 'アカウント情報',
              desc: '表示名、ログイン識別子。ユーザー識別およびステータス保持のため。',
            },
            {
              term: '活動データ',
              desc: 'ログイン履歴、獲得および使用した LP（Love Points）、取得した称号、お気に入り登録情報。ステータスカード生成および称号判定のため。',
            },
            {
              term: 'アクセス解析',
              desc: '閲覧履歴、端末情報。サイトの利便性向上および統計データ作成のため。',
            },
          ].map(({ term, desc }) => (
            <li key={term} className="flex gap-3 text-sm">
              <span className="mt-0.5 shrink-0 text-[var(--magenta)] font-semibold">/</span>
              <span>
                <span className="font-semibold text-[var(--text)]">{term}：</span>
                <span className="text-[var(--text-muted)]">{desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    number: '②',
    title:  'データの管理と保存',
    body: (
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        ユーザーデータは、クラウドプラットフォーム{' '}
        <span className="font-semibold text-[var(--text)]">Supabase</span>{' '}
        上のデータベースにて安全に管理されます。適切なアクセス制限（Row Level Security 等）を行い、
        不正アクセスや漏洩の防止に努めます。
      </p>
    ),
  },
  {
    number: '③',
    title:  'サードパーティ API との連携',
    body: (
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        本サービスは{' '}
        <a
          href="https://affiliate.dmm.com/api/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--magenta)] hover:underline"
        >
          DMM Webサービス API
        </a>
        {' '}を利用して製品情報を取得・表示しています。ユーザーがアフィリエイトリンクをクリックした際の
        遷移先での行動については、DMM 側のプライバシーポリシーが適用されます。
      </p>
    ),
  },
  {
    number: '④',
    title:  'クッキー（Cookie）の利用',
    body: (
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        年齢確認の状態保持（有効期間：<span className="font-semibold text-[var(--text)]">7日間</span>）
        およびセッション管理のために Cookie を使用します。
      </p>
    ),
  },
  {
    number: '⑤',
    title:  'お問い合わせ・権利行使',
    body: (
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        登録情報の削除、修正、および肖像権・著作権に関するお問い合わせは、運営事務局までご連絡ください。
        <br className="hidden sm:block" />
        <span className="mt-2 block sm:inline sm:mt-0">
          運営事務局:{' '}
          <span className="font-semibold text-[var(--text)]">VERITY編集部</span>
          {' ／ '}
          <a
            href="/verity/contact"
            className="text-[var(--magenta)] hover:underline"
          >
            お問い合わせフォーム
          </a>
        </span>
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-12">

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--magenta)]/30
                        bg-[var(--magenta)]/10 px-4 py-1.5">
          <ShieldCheck size={13} className="text-[var(--magenta)]" />
          <span className="text-[11px] font-bold tracking-widest uppercase text-[var(--magenta)]">
            Privacy Policy
          </span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]">
          プライバシーポリシー
        </h1>

        <div className="h-px bg-gradient-to-r from-[var(--magenta)]/40 via-[var(--border)] to-transparent" />

        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          VERITY（以下「当サービス」）は、ユーザーの個人情報の保護を重要視し、
          以下の方針に従って適切に取り扱います。
        </p>
      </div>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <section
            key={s.number}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-6 space-y-3"
          >
            <div className="flex items-baseline gap-2.5">
              <span className="text-[var(--magenta)] font-bold text-base select-none">
                {s.number}
              </span>
              <h2 className="text-base font-bold tracking-tight text-[var(--text)]">
                {s.title}
              </h2>
            </div>
            <div className="h-px bg-[var(--border)]" />
            <div>{s.body}</div>
          </section>
        ))}
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <p className="text-center text-[11px] text-[var(--text-muted)]/60">
        本ポリシーは予告なく変更される場合があります。最新情報は本ページにて確認ください。
        <br />
        最終更新: 2026年5月
      </p>

    </div>
  )
}
