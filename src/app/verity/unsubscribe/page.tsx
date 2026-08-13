import type { Metadata } from 'next'
import Link from 'next/link'
import { BellOff, CheckCircle2, XCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: '通知停止 — VERITY',
  description: 'VERITYのメール通知を停止しました。',
  robots: { index: false },
}

const TYPE_LABEL: Record<string, string> = {
  actress_new_release: '新作通知',
  weekly_ranking: '週間ランキング通知',
  all: 'VERITYのメール通知',
}

type Props = { searchParams: Promise<{ type?: string; error?: string }> }

export default async function UnsubscribePage({ searchParams }: Props) {
  const { type, error } = await searchParams
  const ok = !error
  const label = type ? (TYPE_LABEL[type] ?? '通知') : '通知'

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center space-y-6">
      <div className="flex justify-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full ${
            ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}
        >
          {ok ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
        </span>
      </div>

      {ok ? (
        <>
          <h1 className="text-xl font-bold text-[var(--text)]">{label}を停止しました</h1>
          <p className="text-sm text-[var(--text-muted)]">
            今後、このメールアドレスへ{label}は届きません。
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-[var(--text)]">リンクが無効です</h1>
          <p className="text-sm text-[var(--text-muted)]">
            リンクの有効期限が切れているか、URLが正しくない可能性があります。
            <br />
            お手数ですがマイページから通知設定を変更してください。
          </p>
        </>
      )}

      <div className="flex items-center justify-center gap-2 pt-4">
        <BellOff size={13} className="text-[var(--text-muted)]" />
        <Link href="/verity/profile" className="text-sm font-bold text-[var(--magenta)] hover:underline">
          通知設定を変更する
        </Link>
      </div>
    </div>
  )
}
