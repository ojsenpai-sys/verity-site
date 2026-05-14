'use server'

import { createClient as createAnonClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { withAffiliate } from '@/lib/affiliate'
import type { SnNewsWithActress } from '@/lib/types'

const SITE_KEY = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin() {
  const supabase    = await createAnonClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail  = process.env.ADMIN_EMAIL
  if (!user || !adminEmail || user.email !== adminEmail) {
    throw new Error('unauthorized')
  }
  return user
}

type RawRow = {
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

function normalise(row: RawRow): SnNewsWithActress {
  const raw = row.gallery_urls
  const gallery_urls: string[] = Array.isArray(raw)
    ? (raw as unknown[]).filter((u): u is string => typeof u === 'string')
    : []
  return { ...row, gallery_urls, tags: row.tags ?? [], actress: row.actress ?? null }
}

const SELECT = `
  id, site_key, actress_id, title, slug, category,
  content, summary, thumbnail_url, gallery_urls, fanza_link,
  tags, is_published, published_at, created_at, updated_at,
  actress:actresses!sn_news_actress_id_fkey(
    id, name, ruby, external_id, image_url
  )
`

// ── 全記事取得（管理者専用、RLS 無視） ──────────────────────────────────────
export async function adminFetchNewsList(limit = 50, offset = 0): Promise<{
  items: SnNewsWithActress[]
  hasMore: boolean
  stats: { total: number; published: number; drafts: number }
}> {
  await requireAdmin()

  const db = svc()

  const [listRes, statsRes] = await Promise.all([
    db
      .from('sn_news')
      .select(SELECT)
      .eq('site_key', SITE_KEY)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit),
    db
      .from('sn_news')
      .select('is_published', { count: 'exact' })
      .eq('site_key', SITE_KEY),
  ])

  const raw     = (listRes.data ?? []) as unknown as RawRow[]
  const hasMore = raw.length > limit

  const allRows   = (statsRes.data ?? []) as { is_published: boolean }[]
  const total     = allRows.length
  const published = allRows.filter(r => r.is_published).length
  const drafts    = total - published

  return {
    items:   raw.slice(0, limit).map(normalise),
    hasMore,
    stats:   { total, published, drafts },
  }
}

// ── 記事取得（slug） ─────────────────────────────────────────────────────────
export async function adminFetchNewsBySlug(slug: string): Promise<SnNewsWithActress | null> {
  await requireAdmin()
  const db = svc()
  const { data } = await db
    .from('sn_news')
    .select(SELECT)
    .eq('slug', slug)
    .maybeSingle()
  return data ? normalise(data as unknown as RawRow) : null
}

// ── 女優リスト取得（フォーム用） ─────────────────────────────────────────────
export async function adminFetchActresses(): Promise<
  { id: string; external_id: string; name: string; ruby: string | null }[]
> {
  await requireAdmin()
  const db = svc()
  const { data } = await db
    .from('actresses')
    .select('id, external_id, name, ruby')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as { id: string; external_id: string; name: string; ruby: string | null }[]
}

// ── 記事投稿・更新 ────────────────────────────────────────────────────────────
export type AdminPostNewsInput = {
  title:         string
  slug:          string
  content:       string
  summary?:      string
  category?:     string
  actress_id?:   string   // external_id
  thumbnail_url?: string
  gallery_urls?:  string[]
  fanza_link?:   string
  tags?:         string[]
  is_published?: boolean
  published_at?: string
}

export async function adminPostNews(
  input: AdminPostNewsInput,
): Promise<{ id: string; isNew: boolean } | { error: string }> {
  await requireAdmin()
  const db  = svc()
  const now = new Date().toISOString()

  const fanzaLinkFinal = withAffiliate(input.fanza_link) ?? input.fanza_link ?? null

  const payload = {
    site_key:      SITE_KEY,
    actress_id:    input.actress_id ?? null,
    title:         input.title,
    slug:          input.slug,
    category:      input.category ?? 'NEWS',
    content:       input.content,
    summary:       input.summary ?? null,
    thumbnail_url: input.thumbnail_url ?? null,
    gallery_urls:  JSON.stringify(input.gallery_urls ?? []),
    fanza_link:    fanzaLinkFinal,
    tags:          input.tags ?? [],
    is_published:  input.is_published ?? true,
    updated_at:    now,
  }

  // slug 重複チェック
  const { data: existing } = await db
    .from('sn_news')
    .select('id')
    .eq('slug', input.slug)
    .maybeSingle()

  if (existing) {
    const { error } = await db.from('sn_news').update(payload).eq('slug', input.slug)
    if (error) return { error: error.message }
    return { id: (existing as { id: string }).id, isNew: false }
  }

  const { data, error } = await db
    .from('sn_news')
    .insert({ ...payload, published_at: input.published_at ?? now })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: (data as { id: string }).id, isNew: true }
}

// ── 記事削除 ─────────────────────────────────────────────────────────────────
export async function adminDeleteNews(id: string): Promise<{ ok: boolean } | { error: string }> {
  await requireAdmin()
  const db = svc()
  const { error } = await db.from('sn_news').delete().eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── 公開/下書き切り替え ───────────────────────────────────────────────────────
export async function adminTogglePublish(
  id: string,
  isPublished: boolean,
): Promise<{ ok: boolean } | { error: string }> {
  await requireAdmin()
  const db = svc()
  const now = new Date().toISOString()
  const { error } = await db
    .from('sn_news')
    .update({
      is_published: isPublished,
      published_at: isPublished ? now : undefined,
      updated_at:   now,
    })
    .eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}
