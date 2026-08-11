'use client'

import { useState } from 'react'
import { Bell, Trophy } from 'lucide-react'

// メール送信バッチ（Resend連携・cron）はまだ実装していない（Phase 2以降）。
// 設定自体は保存されるが実際の送信は行われないため、その旨を明示する。
// 送信機能が稼働したら、この1行を false→true にするだけで注記が消える。
const NOTIFICATIONS_LIVE = false

type SettingsKey = 'notify_new_work' | 'notify_weekly'

type Settings = {
  notify_new_work: boolean
  notify_weekly:   boolean
}

type Props = {
  initialSettings: Settings
}

function Toggle({
  checked, disabled, onClick, label,
}: {
  checked:  boolean
  disabled: boolean
  onClick:  () => void
  label:    string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--magenta)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-[var(--magenta)]' : 'bg-[var(--border)]'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function NotificationRow({
  icon, title, description, checked, pending, onToggle,
}: {
  icon:        React.ReactNode
  title:       string
  description: string
  checked:     boolean
  pending:     boolean
  onToggle:    () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 text-[var(--magenta)] shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{description}</p>
        </div>
      </div>
      <Toggle checked={checked} disabled={pending} onClick={onToggle} label={title} />
    </div>
  )
}

export function NotificationSettingsSection({ initialSettings }: Props) {
  const [settings, setSettings] = useState<Settings>(initialSettings)
  const [pendingKey, setPendingKey] = useState<SettingsKey | null>(null)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  async function toggle(key: SettingsKey) {
    if (pendingKey) return // 連打防止: 保存中は他のtoggleも待つ
    const prevValue = settings[key]
    const nextValue = !prevValue

    setPendingKey(key)
    setMessage(null)
    setSettings(prev => ({ ...prev, [key]: nextValue })) // 楽観的更新

    try {
      const res = await fetch('/verity/api/notification-settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [key]: nextValue }),
      })
      if (!res.ok) throw new Error()
      setMessage({ text: '保存しました', isError: false })
    } catch {
      setSettings(prev => ({ ...prev, [key]: prevValue })) // rollback
      setMessage({ text: '保存に失敗しました。もう一度お試しください。', isError: true })
    } finally {
      setPendingKey(null)
      setTimeout(() => setMessage(null), 2500)
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <Bell size={15} className="text-[var(--magenta)]" />
        メール通知設定
      </h2>

      {!NOTIFICATIONS_LIVE && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          ※ 通知メールの送信機能は準備中です。設定は保存されますが、送信開始までしばらくお待ちください。
        </p>
      )}

      <div className="mt-2 divide-y divide-[var(--border)]">
        <NotificationRow
          icon={<Bell size={16} />}
          title="お気に入り女優の新作情報"
          description="お気に入り登録した女優の新作がVERITYに追加された際、登録メールアドレスへお知らせします。"
          checked={settings.notify_new_work}
          pending={pendingKey === 'notify_new_work'}
          onToggle={() => toggle('notify_new_work')}
        />
        <NotificationRow
          icon={<Trophy size={16} />}
          title="VERITY週間ランキング"
          description="毎週日曜日、VERITY週間ランキング更新時にお知らせします。"
          checked={settings.notify_weekly}
          pending={pendingKey === 'notify_weekly'}
          onToggle={() => toggle('notify_weekly')}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-[var(--text-muted)]">通知はいつでもOFFにできます。</p>
        {message && (
          <p
            role="status"
            className={`text-[11px] font-medium ${message.isError ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
