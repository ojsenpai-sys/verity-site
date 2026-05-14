'use server'

import { createClient } from '@/lib/supabase/server'
import type { SnNewsWithActress } from '@/lib/types'

const SITE_KEY   = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const NEWS_LIMIT = 20

type RawNewsRow = {
  id:            string
  site_key:      string
  actress_id:    string | null
  title:         string
  slug:          string
  category:      string | null
  content:       string
  summary:       string | null
  thumbnail_url: string | null
  gallery_urls:  unknown
  fanza_link:    string | null
  tags:          string[] | null
  is_published:  boolean
  published_at:  string | null
  created_at:    string
  updated_at:    string | null
  actress:       {
    id:          string
    name:        string
    ruby:        string | null
    external_id: string
    image_url:   string | null
  } | null
}

function normalise(row: RawNewsRow): SnNewsWithActress {
  const galleryRaw = row.gallery_urls
  const gallery_urls: string[] = Array.isArray(galleryRaw)
    ? (galleryRaw as unknown[]).filter((u): u is string => typeof u === 'string')
    : []

  return {
    ...row,
    gallery_urls,
    tags: row.tags ?? [],
    actress: row.actress ?? null,
  }
}

const SELECT = `
  *,
  actress:actresses!sn_news_actress_id_fkey(
    id, name, ruby, external_id, image_url
  )
`

// ── ニュース一覧（公開済み、降順） ──────────────────────────────────────────
export async function fetchNewsList(
  limit = NEWS_LIMIT,
  offset = 0,
): Promise<{ items: SnNewsWithActress[]; hasMore: boolean }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sn_news')
    .select(SELECT)
    .eq('site_key', SITE_KEY)
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .range(offset, offset + limit)   // limit+1 rows → detect hasMore

  if (error) {
    console.error('[fetchNewsList]', error.message)
    return { items: [], hasMore: false }
  }

  const raw     = (data ?? []) as RawNewsRow[]
  const hasMore = raw.length > limit
  const slice   = raw.slice(0, limit)

  return { items: slice.map(normalise), hasMore }
}

// ── スラッグで記事詳細を取得 ──────────────────────────────────────────────
export async function fetchNewsBySlug(slug: string): Promise<SnNewsWithActress | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sn_news')
    .select(SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle()

  if (error || !data) return null

  return normalise(data as RawNewsRow)
}

// ── 管理者用記事投稿 ──────────────────────────────────────────────────────
export type PostNewsInput = {
  title:         string
  slug:          string
  content:       string
  summary?:      string
  category?:     string
  actress_id?:   string   // actresses.external_id
  thumbnail_url?: string
  gallery_urls?:  string[]
  fanza_link?:   string
  tags?:         string[]
  is_published?: boolean
  published_at?: string   // ISO string
}

export async function postNews(input: PostNewsInput): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmail = process.env.ADMIN_EMAIL
  if (!user || (adminEmail && user.email !== adminEmail)) {
    return { error: 'unauthorized' }
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('sn_news')
    .insert({
      site_key:      SITE_KEY,
      actress_id:    input.actress_id ?? null,
      title:         input.title,
      slug:          input.slug,
      category:      input.category ?? 'NEWS',
      content:       input.content,
      summary:       input.summary ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      gallery_urls:  JSON.stringify(input.gallery_urls ?? []),
      fanza_link:    input.fanza_link ?? null,
      tags:          input.tags ?? [],
      is_published:  input.is_published ?? true,
      published_at:  input.published_at ?? now,
      updated_at:    now,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: (data as { id: string }).id }
}
