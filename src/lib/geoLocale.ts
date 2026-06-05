import { headers } from 'next/headers'

/**
 * Accept-Language ヘッダーの先頭ロケールを見て海外ユーザーかどうかを判定。
 * 'ja' で始まるロケール → 国内ユーザー（false）
 * それ以外（en, zh, ko, th など）→ 海外ユーザー（true）
 * ヘッダーが取得できない場合は false（国内として扱う）。
 */
export async function getIsOverseasUser(): Promise<boolean> {
  try {
    const hdrs = await headers()
    const raw = hdrs.get('accept-language') ?? ''
    const primary = raw.split(',')[0]?.split(';')[0]?.toLowerCase().trim() ?? ''
    return primary.length > 0 && !primary.startsWith('ja')
  } catch {
    return false
  }
}
