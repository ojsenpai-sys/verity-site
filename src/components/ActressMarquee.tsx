import { createClient } from '@/lib/supabase/server'
import type { Actress } from '@/lib/types'
import { fetchActressImagesByName } from '@/lib/sources/dmm'
import { ActressMarqueeStrip, type MarqueeTile } from './ActressMarqueeStrip'

// 編集可能な固定枠: 表示順 先頭に固定 / 除外リスト
const MARQUEE_PINNED  = ['佐々木さき', '逢沢みゆ', '北岡果林', '花守夏歩']
const MARQUEE_EXCLUDE = new Set(['武田もなみ'])

type Props = { actresses: Actress[] }

type MetaActress = { id: number; name: string }

function pickSolo(
  articles: Array<{ image_url: unknown; tags: unknown; metadata: unknown }>,
  actressNameSet: Set<string>,
  imageMap: Map<string, string>,
  limit: number,
) {
  for (const article of articles) {
    if (imageMap.size >= limit) break
    const raw = article.metadata as Record<string, unknown> | null
    const meta = Array.isArray(raw?.actress) ? (raw!.actress as MetaActress[]) : null
    if (!meta || meta.length !== 1) continue
    const name = meta[0].name
    if (actressNameSet.has(name) && !imageMap.has(name))
      imageMap.set(name, article.image_url as string)
  }
}

function pickAny(
  articles: Array<{ image_url: unknown; tags: unknown; metadata: unknown }>,
  actressNameSet: Set<string>,
  imageMap: Map<string, string>,
  limit: number,
) {
  for (const article of articles) {
    if (imageMap.size >= limit) break
    for (const tag of (article.tags as string[]) ?? []) {
      if (actressNameSet.has(tag) && !imageMap.has(tag)) {
        imageMap.set(tag, article.image_url as string)
        break
      }
    }
  }
}

export async function ActressMarquee({ actresses }: Props) {
  // Pinned actresses first (always included regardless of monthly_rank),
  // then fill from rank order, excluding any names in MARQUEE_EXCLUDE.
  const pinnedActresses = MARQUEE_PINNED
    .map(name => actresses.find(a => a.name === name))
    .filter((a): a is Actress => a != null)

  const rankedPool = actresses.filter(
    a => !MARQUEE_EXCLUDE.has(a.name) && !MARQUEE_PINNED.includes(a.name),
  )

  const top = [...pinnedActresses, ...rankedPool].slice(0, 50)
  if (top.length === 0) return null

  const supabase = await createClient()
  const actressNameSet = new Set(top.map((a) => a.name))
  const imageMap = new Map<string, string>()

  // ── Pass 0: metadata.latest_cid → batch-fetch all latest article images ──
  // syncActressHeroImages writes latest_cid into each actress record; this lets
  // the marquee show the most-recent package image with a single DB query.
  {
    const cidByName = new Map<string, string>()
    for (const a of top) {
      const cid = a.metadata?.latest_cid as string | undefined
      if (cid) cidByName.set(a.name, cid)
    }

    if (cidByName.size > 0) {
      const { data: latestArts } = await supabase
        .from('articles')
        .select('external_id, image_url')
        .in('external_id', [...cidByName.values()])
        .not('image_url', 'is', null)

      const artMap = new Map<string, string>(
        (latestArts ?? []).map(r => [r.external_id as string, r.image_url as string]),
      )

      for (const a of top) {
        const cid = cidByName.get(a.name)
        if (cid && artMap.has(cid)) imageMap.set(a.name, artMap.get(cid)!)
      }
    }
    console.log(`[marquee] after pass 0 (latest_cid): ${imageMap.size}/${top.length}`)
  }

  // ── Passes 1 + 2: solo / any within 14 days ──────────────────────────────
  const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recent14 } = await supabase
    .from('articles')
    .select('image_url, tags, metadata')
    .eq('is_active', true)
    .not('image_url', 'is', null)
    .gte('published_at', cutoff14)
    .order('published_at', { ascending: false })
    .limit(500)

  pickSolo(recent14 ?? [], actressNameSet, imageMap, top.length)   // Pass 1
  pickAny(recent14 ?? [], actressNameSet, imageMap, top.length)    // Pass 2
  console.log(`[marquee] after pass 1+2 (14d): ${imageMap.size}/${top.length}`)

  // ── Pass 3: solo within 180 days ─────────────────────────────────────────
  if (imageMap.size < top.length) {
    const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()

    const { data: recent180 } = await supabase
      .from('articles')
      .select('image_url, tags, metadata')
      .eq('is_active', true)
      .not('image_url', 'is', null)
      .gte('published_at', cutoff180)
      .lt('published_at', cutoff14)
      .order('published_at', { ascending: false })
      .limit(1000)

    pickSolo(recent180 ?? [], actressNameSet, imageMap, top.length)
    console.log(`[marquee] after pass 3 (180d solo): ${imageMap.size}/${top.length}`)
  }

  // ── Pass 4: actress profile image from actresses table ───────────────────
  if (imageMap.size < top.length) {
    for (const a of top) {
      if (!imageMap.has(a.name) && a.image_url)
        imageMap.set(a.name, a.image_url)
    }
    console.log(`[marquee] after pass 4 (actress.image_url): ${imageMap.size}/${top.length}`)
  }

  // ── Pass 5: unlimited time range — any article ever synced ───────────────
  // Runs only for actresses still without an image after all prior passes.
  if (imageMap.size < top.length) {
    const stillMissing = top
      .filter((a) => !imageMap.has(a.name))
      .map((a) => a.name)

    console.log(`[marquee] pass 5 needed for: ${stillMissing.join(', ')}`)

    const { data: anytime } = await supabase
      .from('articles')
      .select('image_url, tags, metadata')
      .eq('is_active', true)
      .not('image_url', 'is', null)
      .overlaps('tags', stillMissing)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500)

    pickSolo(anytime ?? [], actressNameSet, imageMap, top.length)
    pickAny(anytime ?? [], actressNameSet, imageMap, top.length)
    console.log(`[marquee] after pass 5 (unlimited): ${imageMap.size}/${top.length}`)
  }

  // ── Pass 6: DMM ActressSearch by name — last-resort API call ────────────
  // Triggers only when the DB has no image AND no article found across all time.
  // Capped at 5 names to avoid adding latency on normal renders.
  if (imageMap.size < top.length) {
    const finalMissing = top.filter((a) => !imageMap.has(a.name)).map((a) => a.name)
    console.log(`[marquee] pass 6 DMM name API for: ${finalMissing.join(', ')}`)

    const nameMap = await fetchActressImagesByName(finalMissing, 5)
    for (const [name, url] of nameMap) imageMap.set(name, url)
    console.log(`[marquee] after pass 6 (DMM API): ${imageMap.size}/${top.length}`)
  }

  // ── Final diagnostic log ─────────────────────────────────────────────────
  const missing = top.filter((a) => !imageMap.has(a.name)).map((a) => a.name)
  if (missing.length > 0) {
    console.log(`[marquee] 画像未取得 (color icon fallback): ${missing.join(', ')}`)
  }

  const tiles: MarqueeTile[] = top.map((a) => ({
    name:       a.name,
    externalId: a.external_id,
    imageUrl:   imageMap.get(a.name) ?? null,
  }))

  return <ActressMarqueeStrip tiles={tiles} />
}
