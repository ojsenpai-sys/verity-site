'use server'

import { createClient } from '@/lib/supabase/server'
import { buildFanzaUrl } from '@/lib/fanzaUtils'

const LOAD_MORE_LIMIT = 20

type SocialPost = {
  id:           string
  actress_name: string
  screen_name:  string
  post_id:      string
  image_url:    string
  post_url:     string
  created_at:   string
}

export type SocialPostWithFanza = SocialPost & { fanzaHref: string }

async function resolveActressIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actressNames: string[],
): Promise<Map<string, number>> {
  const idMap = new Map<string, number>()
  if (actressNames.length === 0) return idMap
  const { data } = await supabase
    .from('actresses')
    .select('name, external_id')
    .in('name', actressNames)
  for (const row of data ?? []) {
    const match = String(row.external_id ?? '').match(/dmm-actress-(\d+)/)
    if (match) idMap.set(row.name as string, parseInt(match[1], 10))
  }
  return idMap
}

export async function fetchMoreSocialPosts(
  offset: number,
  limit = LOAD_MORE_LIMIT,
): Promise<{ posts: SocialPostWithFanza[]; hasMore: boolean }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('social_feeds')
    .select('id, actress_name, screen_name, post_id, image_url, post_url, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)   // limit+1 rows to detect hasMore

  if (error) {
    console.error('[fetchMoreSocialPosts]', error.message)
    return { posts: [], hasMore: false }
  }

  const raw     = (data as SocialPost[]) ?? []
  const hasMore = raw.length > limit
  const slice   = raw.slice(0, limit)

  const uniqueNames = [...new Set(slice.map(p => p.actress_name))]
  const idMap = await resolveActressIds(supabase, uniqueNames)

  return {
    posts: slice.map(p => ({
      ...p,
      fanzaHref: buildFanzaUrl(p.actress_name, idMap.get(p.actress_name) ?? null),
    })),
    hasMore,
  }
}
