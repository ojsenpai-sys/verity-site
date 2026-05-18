import type { SupabaseClient } from '@supabase/supabase-js'
import { withAffiliate } from './affiliate'
import { buildFanzaUrl } from './fanzaUtils'

type ArticleRow = {
  tags:     string[] | null
  metadata: Record<string, unknown> | null
}

/**
 * 女優名リストを受け取り、各女優の最新 videoa 作品アフィリエイト URL を返す。
 * Pass 1: videoa 限定で最新作を取得（動画配信を最優先）
 * Pass 2: videoa が見つからなかった女優のみ任意フロアで補填
 * ・作品が見つからなければ buildFanzaUrl() による検索一覧 URL をフォールバック
 */
export async function resolveLatestAffiliateHrefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  actressNames: string[],
  idMap: Map<string, number>,
): Promise<Map<string, string>> {
  const hrefMap = new Map<string, string>()
  if (actressNames.length === 0) return hrefMap

  // ── Pass 1: 実ストリーミング作品限定（floor=videoa かつ URL が /mono/dvd/ でない）
  // ※ floor=videoa でも affiliate_url が DVD URL のレコードが混在するため URL でも除外
  const { data: videoaArticles } = await supabase
    .from('articles')
    .select('tags, metadata')
    .eq('is_active', true)
    .filter('metadata->>floor', 'eq', 'videoa')
    .not('metadata->>url', 'like', '%/mono/dvd/%')
    .overlaps('tags', actressNames)
    .order('published_at', { ascending: false })
    .limit(actressNames.length * 5)

  const videoaMap = new Map<string, string>()
  for (const row of (videoaArticles ?? []) as ArticleRow[]) {
    const tags = row.tags ?? []
    const meta = row.metadata
    const raw  = (meta?.affiliate_url as string | null) ?? (meta?.url as string | null)
    const href = withAffiliate(raw)
    if (!href) continue
    for (const name of actressNames) {
      if (!videoaMap.has(name) && tags.includes(name)) videoaMap.set(name, href)
    }
  }

  // ── Pass 2: videoa が見つからなかった女優のみ任意フロアで補填 ─────────
  const unresolved = actressNames.filter(n => !videoaMap.has(n))
  const anyMap = new Map<string, string>()
  if (unresolved.length > 0) {
    const { data: anyArticles } = await supabase
      .from('articles')
      .select('tags, metadata')
      .eq('is_active', true)
      .overlaps('tags', unresolved)
      .order('published_at', { ascending: false })
      .limit(unresolved.length * 5)

    for (const row of (anyArticles ?? []) as ArticleRow[]) {
      const tags = row.tags ?? []
      const meta = row.metadata
      const raw  = (meta?.affiliate_url as string | null) ?? (meta?.url as string | null)
      const href = withAffiliate(raw)
      if (!href) continue
      for (const name of unresolved) {
        if (!anyMap.has(name) && tags.includes(name)) anyMap.set(name, href)
      }
    }
  }

  // ── 結果をマージ（videoa → 任意作品 → 検索URL） ──────────────────────
  for (const name of actressNames) {
    hrefMap.set(
      name,
      videoaMap.get(name) ??
      anyMap.get(name) ??
      buildFanzaUrl(name, idMap.get(name) ?? null),
    )
  }

  return hrefMap
}
