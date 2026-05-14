export type Article = {
  id: string
  external_id: string
  title: string
  slug: string
  source: string
  category: string | null
  tags: string[] | null
  summary: string | null
  content: string | null
  image_url: string | null
  published_at: string | null
  fetched_at: string
  metadata: Record<string, unknown> | null
  is_active: boolean
}

export type AffiliateLink = {
  id: string
  article_id: string
  category: string | null
  label: string
  url: string
  display_order: number
}

export type Source = {
  id: string
  name: string
  api_endpoint: string | null
  api_key_env: string | null
  is_active: boolean
  last_synced_at: string | null
}

export type FilterParams = {
  category?: string
  source?: string
  tag?: string
  q?: string
}

export type PipelineResult = {
  inserted: number
  skipped: number
  errors: number
  source: string
  errorDetails?: string[]
}

export type Actress = {
  id: string
  external_id: string
  name: string
  ruby: string | null
  image_url: string | null
  metadata: Record<string, unknown> | null
  is_active: boolean
}

export type UnlockedTitle = {
  id:          string
  unlocked_at: string
  name?:       string  // actress_master_* などの動的称号に使用
}

export type Profile = {
  user_id:                  string
  brand_id:                 string
  display_name:             string | null
  avatar_url:               string | null
  favorite_actress_ids:     string[]
  title:                    string | null
  titles_data:              UnlockedTitle[]
  stars_count:              number
  lp_balance:               number
  last_login_at:            string | null
  login_streak:             number
  last_gallery_checked_at:  string | null
  login_days_count:         number
  lp_transfer_count:        number
  favorite_change_count:    number
  equipped_epithet:         string | null
  created_at:               string
  updated_at:               string
}

export type SnNewsItem = {
  id:            string
  site_key:      string
  actress_id:    string | null
  title:         string
  slug:          string
  category:      string | null
  content:       string
  summary:       string | null
  thumbnail_url: string | null
  gallery_urls:  string[]
  fanza_link:    string | null
  tags:          string[]
  is_published:  boolean
  published_at:  string | null
  created_at:    string
  updated_at:    string | null
}

export type SnNewsActress = {
  id:          string
  name:        string
  ruby:        string | null
  external_id: string
  image_url:   string | null
}

export type SnNewsWithActress = SnNewsItem & {
  actress: SnNewsActress | null
}
