#!/usr/bin/env tsx
/**
 * ニュース記事入稿 CLI
 *
 * Usage:
 *   npx tsx scripts/post-news.ts \
 *     --title "タイトル" \
 *     --slug  "url-slug" \
 *     --content ./path/to/article.md \
 *     [--actress_id  "dmm-actress-XXXXXXX"] \
 *     [--fanza_link  "https://..."] \
 *     [--thumbnail   "https://..."] \
 *     [--gallery     "url1,url2,url3"] \
 *     [--category    "NEWS"] \
 *     [--summary     "リード文"] \
 *     [--tags        "tag1,tag2"] \
 *     [--draft]
 *
 * --draft を付けると is_published=false で下書き保存。
 */

import { createClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'

// ── .env 読み込み ────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SITE_KEY             = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const AFFILIATE_ID         = process.env.AFFILIATE_ID ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// ── 引数パーサー ─────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  let i = 0
  while (i < argv.length) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[key] = argv[++i]
      } else {
        out[key] = true
      }
    }
    i++
  }
  return out
}

// ── アフィリエイトリンク生成 ──────────────────────────────────────────────
function withAffiliate(url: string | undefined): string | undefined {
  if (!url) return undefined
  if (!AFFILIATE_ID) return url
  try {
    const u = new URL(url)
    if (u.hostname === 'al.dmm.co.jp') {
      if (!u.searchParams.has('af_id')) u.searchParams.set('af_id', AFFILIATE_ID)
      if (!u.searchParams.has('ch'))    u.searchParams.set('ch',    'toolbar')
      return u.toString()
    }
    if (u.hostname.endsWith('dmm.co.jp') || u.hostname.endsWith('dmm.com')) {
      return `https://al.dmm.co.jp/?lurl=${encodeURIComponent(url)}&af_id=${encodeURIComponent(AFFILIATE_ID)}&ch=toolbar`
    }
    return url
  } catch {
    return url
  }
}

// ── メイン ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))

  const title       = args['title']      as string | undefined
  const slug        = args['slug']       as string | undefined
  const contentArg  = args['content']    as string | undefined
  const actressId   = args['actress_id'] as string | undefined
  const fanzaLink   = args['fanza_link'] as string | undefined
  const thumbnail   = args['thumbnail']  as string | undefined
  const galleryArg  = args['gallery']    as string | undefined
  const category    = (args['category']  as string | undefined) ?? 'NEWS'
  const summary     = args['summary']    as string | undefined
  const tagsArg     = args['tags']       as string | undefined
  const isDraft     = args['draft'] === true

  if (!title || !slug || !contentArg) {
    console.error('Usage: npx tsx scripts/post-news.ts --title "..." --slug "..." --content ./article.md')
    process.exit(1)
  }

  // Markdown 読み込み
  const contentPath = path.isAbsolute(contentArg)
    ? contentArg
    : path.join(process.cwd(), contentArg)

  if (!fs.existsSync(contentPath)) {
    console.error(`❌ ファイルが見つかりません: ${contentPath}`)
    process.exit(1)
  }
  const content = fs.readFileSync(contentPath, 'utf8')

  // ギャラリー URL 配列化
  const gallery_urls = galleryArg
    ? galleryArg.split(',').map(u => u.trim()).filter(Boolean)
    : []

  // タグ配列化
  const tags = tagsArg
    ? tagsArg.split(',').map(t => t.trim()).filter(Boolean)
    : []

  // アフィリエイトリンク付与
  const fanzaLinkFinal = withAffiliate(fanzaLink)

  const now = new Date().toISOString()

  // 女優存在確認
  if (actressId) {
    const { data: act } = await supabase
      .from('actresses')
      .select('id, name')
      .eq('external_id', actressId)
      .maybeSingle()

    if (!act) {
      console.error(`⚠  actress external_id "${actressId}" が見つかりませんでした（続行します）`)
    } else {
      console.log(`✓ 女優確認: ${act.name} (${actressId})`)
    }
  }

  // slug 重複チェック
  const { data: existing } = await supabase
    .from('sn_news')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    // UPDATE
    const { error } = await supabase
      .from('sn_news')
      .update({
        title,
        content,
        summary:       summary ?? null,
        category,
        actress_id:    actressId ?? null,
        thumbnail_url: thumbnail ?? null,
        gallery_urls:  JSON.stringify(gallery_urls),
        fanza_link:    fanzaLinkFinal ?? null,
        tags,
        is_published:  !isDraft,
        updated_at:    now,
      })
      .eq('slug', slug)

    if (error) {
      console.error('❌ 更新エラー:', error.message)
      process.exit(1)
    }
    console.log(`✓ 記事を更新しました: "${title}" (/verity/news/${slug})`)
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('sn_news')
      .insert({
        site_key:      SITE_KEY,
        actress_id:    actressId ?? null,
        title,
        slug,
        category,
        content,
        summary:       summary ?? null,
        thumbnail_url: thumbnail ?? null,
        gallery_urls:  JSON.stringify(gallery_urls),
        fanza_link:    fanzaLinkFinal ?? null,
        tags,
        is_published:  !isDraft,
        published_at:  now,
        updated_at:    now,
      })
      .select('id')
      .single()

    if (error) {
      console.error('❌ 投稿エラー:', error.message)
      process.exit(1)
    }
    console.log(`✓ 記事を投稿しました: "${title}" (id: ${(data as { id: string }).id})`)
    console.log(`  URL: /verity/news/${slug}`)
  }

  if (isDraft) {
    console.log('  📝 下書き保存（is_published = false）')
  } else {
    console.log(`  🌐 公開済み`)
  }

  console.log('\n完了しました。')
}

main().catch(e => { console.error(e); process.exit(1) })
