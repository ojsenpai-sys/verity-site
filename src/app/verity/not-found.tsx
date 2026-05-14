import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-24 text-center space-y-8">
      {/* グロー数字 */}
      <div className="relative select-none">
        <p
          className="text-[120px] font-black leading-none tracking-tighter"
          style={{
            background: 'linear-gradient(135deg, #E20074 0%, #ff6eb4 60%, rgba(226,0,116,0.3) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 0 40px rgba(226,0,116,0.35))',
          }}
        >
          404
        </p>
        <div
          className="pointer-events-none absolute inset-0 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, #E20074 0%, transparent 70%)' }}
        />
      </div>

      {/* メッセージ */}
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-[var(--text)]">
          ページが見つかりません
        </h1>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          お探しのコンテンツは存在しないか、移動・削除された可能性があります。
        </p>
      </div>

      {/* アクションリンク */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:opacity-90 hover:shadow-[0_0_20px_rgba(226,0,116,0.4)]"
          style={{ background: 'linear-gradient(135deg, #E20074, #b30059)' }}
        >
          <Zap size={14} />
          トップへ戻る
        </Link>
        <Link
          href="/verity/profile"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-6 py-3 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--text)] transition-colors"
        >
          <ArrowLeft size={14} />
          マイページ
        </Link>
      </div>
    </div>
  )
}
