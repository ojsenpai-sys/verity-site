// 管理者判定（ADMIN_EMAILS カンマ区切り ∥ ADMIN_EMAIL ∥ 既定）
// 管理画面は本判定で許可制（投資家指標/内部KPIを表示するため）。

const DEFAULT_ADMIN = 'ojsenpai@gmail.com'

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getAdminEmails().includes(email.trim().toLowerCase())
}
