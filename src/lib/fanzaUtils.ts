import { withAffiliate } from './affiliate'

export function buildFanzaUrl(actressName: string, actressId: number | null): string {
  const page = actressId
    ? `https://www.dmm.co.jp/digital/videoa/-/list/=/article=actress/id=${actressId}/`
    : `https://www.dmm.co.jp/digital/videoa/-/list/search/=/?searchstr=${encodeURIComponent(actressName)}`
  return withAffiliate(page) ?? page
}
