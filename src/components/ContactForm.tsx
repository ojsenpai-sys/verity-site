'use client'

import { useState } from 'react'
import { FileText, Building2, Mail, User, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

const CARD_OPTIONS = [
  { icon: FileText,  title: '独占インタビュー記事', body: '深掘り取材・企画制作' },
  { icon: Building2, title: 'バナー・タイアップ広告', body: 'PV連動・掲出プラン' },
  { icon: Mail,      title: 'メルマガ・配信協力',   body: '読者への直接リーチ' },
] as const

const API_ENDPOINT = '/verity/api/contact'

export function ContactForm() {
  const [subject, setSubject]   = useState('')
  const [sending, setSending]   = useState(false)
  const [sent,    setSent]      = useState(false)
  const [error,   setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSending(true)

    const form = e.currentTarget
    const data = {
      name:    (form.elements.namedItem('name')    as HTMLInputElement).value.trim(),
      email:   (form.elements.namedItem('email')   as HTMLInputElement).value.trim(),
      subject: (form.elements.namedItem('subject') as HTMLInputElement).value.trim(),
      message: (form.elements.namedItem('message') as HTMLTextAreaElement).value.trim(),
    }

    try {
      const res = await fetch(API_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '送信に失敗しました。しばらくしてから再度お試しください。')
      } else {
        setSent(true)
        form.reset()
        setSubject('')
      }
    } catch {
      setError('ネットワークエラーが発生しました。しばらくしてから再度お試しください。')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* ── Highlight cards (クリックで件名を自動入力) ── */}
      <div className="grid gap-4 sm:grid-cols-3 pt-2">
        {CARD_OPTIONS.map(({ icon: Icon, title, body }) => {
          const active = subject === title
          return (
            <button
              key={title}
              type="button"
              onClick={() => setSubject(active ? '' : title)}
              className={`rounded-xl border p-4 space-y-1.5 text-left transition-all ${
                active
                  ? 'border-[var(--magenta)] bg-[var(--magenta)]/10 shadow-[0_0_14px_rgba(226,0,116,0.2)]'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--magenta)]/40'
              }`}
            >
              <Icon size={18} className="text-[var(--magenta)]" />
              <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
              <p className="text-xs text-[var(--text-muted)]">{body}</p>
            </button>
          )
        })}
      </div>

      {/* ── Form ── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 space-y-6">
        <h2 className="text-lg font-bold text-[var(--text)]">お問い合わせフォーム</h2>

        {/* 送信完了メッセージ */}
        {sent && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4">
            <CheckCircle size={18} className="text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-emerald-400">送信完了しました</p>
              <p className="text-xs text-[var(--text-muted)]">
                お問い合わせいただきありがとうございます。通常 2〜3 営業日以内にご返信いたします。
              </p>
            </div>
          </div>
        )}

        {/* エラーメッセージ */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-4">
            <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]"
            >
              <User size={12} />
              お名前 <span className="text-[var(--magenta)]">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              disabled={sending || sent}
              placeholder="山田 太郎"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5
                         text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
                         focus:border-[var(--magenta)] focus:outline-none transition-colors
                         disabled:opacity-50"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]"
            >
              <Mail size={12} />
              メールアドレス <span className="text-[var(--magenta)]">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              disabled={sending || sent}
              placeholder="contact@example.co.jp"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5
                         text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
                         focus:border-[var(--magenta)] focus:outline-none transition-colors
                         disabled:opacity-50"
            />
          </div>

          {/* Subject — controlled, auto-filled by card click */}
          <div className="space-y-1.5">
            <label
              htmlFor="subject"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]"
            >
              <FileText size={12} />
              件名 <span className="text-[var(--magenta)]">*</span>
              {subject && (
                <span className="ml-1 text-[10px] text-[var(--magenta)]/70">（カードから自動入力済み）</span>
              )}
            </label>
            <input
              id="subject"
              name="subject"
              type="text"
              required
              disabled={sending || sent}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="タイアップ企画のご相談"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5
                         text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
                         focus:border-[var(--magenta)] focus:outline-none transition-colors
                         disabled:opacity-50"
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label
              htmlFor="message"
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]"
            >
              <FileText size={12} />
              お問い合わせ内容 <span className="text-[var(--magenta)]">*</span>
            </label>
            <textarea
              id="message"
              name="message"
              required
              disabled={sending || sent}
              rows={6}
              placeholder="ご相談内容をご記入ください。"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5
                         text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/50
                         focus:border-[var(--magenta)] focus:outline-none transition-colors resize-none
                         disabled:opacity-50"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={sending || sent}
            className="w-full rounded-lg bg-[var(--magenta)] py-3 text-sm font-bold text-white
                       shadow-[0_0_20px_rgba(226,0,116,0.35)] hover:brightness-110
                       hover:shadow-[0_0_28px_rgba(226,0,116,0.5)] transition-all
                       disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                送信中...
              </>
            ) : sent ? (
              <>
                <CheckCircle size={15} />
                送信済み
              </>
            ) : (
              '送信する →'
            )}
          </button>

          {!sent && (
            <p className="text-center text-[11px] text-[var(--text-muted)]">
              通常 2〜3 営業日以内にご返信いたします。
            </p>
          )}
        </form>
      </div>
    </>
  )
}
