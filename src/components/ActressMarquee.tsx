import { createClient } from '@/lib/supabase/server'
import type { Actress } from '@/lib/types'
import { fetchActressImagesByName } from '@/lib/sources/dmm'
import { RECOMMENDED_ACTRESS_NAMES } from '@/lib/recommendedActresses'
import { ActressMarqueeStrip, type MarqueeTile } from './ActressMarqueeStrip'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

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
  const supabase = await createClient()

  // ── Step 1: キャッシュからランキング Top10 を取得 ──────────────────
  // RPC はフルスキャンで重い。キャッシュが空の場合のみ RPC へフォールバック
  let rankedOrder: string[] = []
  {
    const { data: latest } = await supabase
      .from('actress_ranking_cache')
      .select('snapshot_date')
      .eq('brand_id', BRAND_ID)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest) {
      const { data: cacheRows } = await supabase
        .from('actress_ranking_cache')
        .select('actress_id')
        .eq('brand_id', BRAND_ID)
        .eq('snapshot_date', latest.snapshot_date)
        .order('rank', { ascending: true })
        .limit(10)

      if (cacheRows && cacheRows.length > 0) {
        // actress_ranking_cache.actress_id is uuid → map to external_id via the provided actress list
        const idToExtId = new Map(actresses.map(a => [a.id, a.external_id]))
        rankedOrder = (cacheRows as { actress_id: string }[])
          .map(r => idToExtId.get(r.actress_id))
          .filter((id): id is string => id != null)
      }
    }

    // キャッシュが空の場合のみ RPC 呼び出し（4s タイムアウト付き）
    if (rankedOrder.length === 0) {
      const rpcResult = await Promise.race([
        supabase.rpc('get_actress_ranking', { p_brand_id: BRAND_ID, p_limit: 10 }),
        new Promise<{ data: null; error: string }>(resolve =>
          setTimeout(() => resolve({ data: null, error: 'timeout' }), 4000)
        ),
      ])
      rankedOrder = ((rpcResult?.data ?? []) as { actress_external_id: string }[])
        .map(r => r.actress_external_id)
    }
  }

  // ── Step 2: 3グループ構成で最大50名を選定 ─────────────────────────
  const extIdToActress = new Map(actresses.map(a => [a.external_id, a]))
  const nameToActress  = new Map(actresses.map(a => [a.name, a]))

  // グループ1: VERITY人気女優ランキング Top 10（ランク順）
  const rankGroup: Actress[] = rankedOrder
    .map(id => extIdToActress.get(id))
    .filter((a): a is Actress => a != null)

  // グループ2: VERITYオススメ女優（RECOMMENDED_ACTRESS_NAMES 順、ランキング重複除外）
  const priorityExtIds = new Set(rankGroup.map(a => a.external_id))
  const recommendedGroup: Actress[] = (RECOMMENDED_ACTRESS_NAMES as readonly string[])
    .map(name => nameToActress.get(name))
    .filter((a): a is Actress => a != null && !priorityExtIds.has(a.external_id))

  // グループ3: 残り（月間ランキング順、重複除外）で50名まで埋める
  const allPriorityExtIds = new Set([
    ...rankGroup.map(a => a.external_id),
    ...recommendedGroup.map(a => a.external_id),
  ])
  const fillGroup = actresses.filter(a => !allPriorityExtIds.has(a.external_id))

  const top = [...rankGroup, ...recommendedGroup, ...fillGroup].slice(0, 50)
  if (top.length === 0) return null

  const actressNameSet = new Set(top.map(a => a.name))
  const imageMap = new Map<string, string>()

  // ── Pass 0: metadata.latest_cid → batch-fetch all latest article images ──
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
    }  }

  // ── Passes 1 + 2: solo / any within 14 days ──────────────────────
  const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recent14 } = await supabase
    .from('articles')
    .select('image_url, tags, metadata')
    .eq('is_active', true)
    .not('image_url', 'is', null)
    .gte('published_at', cutoff14)
    .order('published_at', { ascending: false })
    .limit(500)

  pickSolo(recent14 ?? [], actressNameSet, imageMap, top.length)
  pickAny(recent14 ?? [], actressNameSet, imageMap, top.length)
  // ── Pass 3: solo within 180 days ─────────────────────────────────
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

    pickSolo(recent180 ?? [], actressNameSet, imageMap, top.length)  }

  // ── Pass 4: actress profile image from actresses table ────────────
  if (imageMap.size < top.length) {
    for (const a of top) {
      if (!imageMap.has(a.name) && a.image_url)
        imageMap.set(a.name, a.image_url)
    }  }

  // ── Pass 5: unlimited time range — any article ever synced ───────
  if (imageMap.size < top.length) {
    const stillMissing = top
      .filter(a => !imageMap.has(a.name))
      .map(a => a.name)

    const { data: anytime } = await supabase
      .from('articles')
      .select('image_url, tags, metadata')
      .eq('is_active', true)
      .not('image_url', 'is', null)
      .overlaps('tags', stillMissing)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500)

    pickSolo(anytime ?? [], actressNameSet, imageMap, top.length)
    pickAny(anytime ?? [], actressNameSet, imageMap, top.length)  }

  // ── Pass 6: DMM ActressSearch by name — last-resort API call ─────
  // Capped at 10 names (up from 5) to reduce chance of missing actresses.
  if (imageMap.size < top.length) {
    const finalMissing = top.filter(a => !imageMap.has(a.name)).map(a => a.name)
    const nameMap = await fetchActressImagesByName(finalMissing, 10)
    for (const [name, url] of nameMap) imageMap.set(name, url)  }

  // ── Safety valve: 画像未取得の女優をカルーセルから除外 ────────────
  // NowPrinting を表示するのではなく、完全にスキップして景観を保つ。

  const tiles: MarqueeTile[] = top
    .filter(a => imageMap.has(a.name))
    .map(a => ({
      name:       a.name,
      externalId: a.external_id,
      imageUrl:   imageMap.get(a.name)!,
    }))

  if (tiles.length === 0) return null

  return <ActressMarqueeStrip tiles={tiles} />
}
