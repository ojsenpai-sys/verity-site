import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// GET /verity/api/actresses?q=<keyword>&limit=<n>
// 女優名の部分一致検索。name・ruby 両方を検索し、is_active を問わず引退女優も返す（active 優先）。
// マスター結果が少ない場合は articles.tags から動的補完（タグベースフォールバック）。

const FALLBACK_THRESHOLD = 2

// name ILIKE 検索 + ruby ILIKE 検索を個別実行してマージ
// .or() 内の % はクライアントバージョンによりエンコードが不安定なため、
// .ilike() を 2 回発行して確実性を確保する。
async function searchActressesByNameOrRuby(
  supabase: Awaited<ReturnType<typeof createClient>>,
  keyword: string,
  limit: number,
) {
  // name 検索と ruby 検索を並列実行
  const [{ data: byName }, { data: byRuby }] = await Promise.all([
    supabase
      .from('actresses')
      .select('id, external_id, name, ruby, image_url, metadata, is_active')
      .ilike('name', `%${keyword}%`)
      .order('is_active', { ascending: false })
      .order('name')
      .limit(limit),
    supabase
      .from('actresses')
      .select('id, external_id, name, ruby, image_url, metadata, is_active')
      .ilike('ruby', `%${keyword}%`)
      .order('is_active', { ascending: false })
      .order('name')
      .limit(limit),
  ])

  // 重複除去して is_active 降順 → name 昇順にソート
  const seen = new Set<string>()
  const merged = [...(byName ?? []), ...(byRuby ?? [])].filter(a => {
    if (seen.has(a.external_id as string)) return false
    seen.add(a.external_id as string)
    return true
  })
  merged.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    return (a.name as string).localeCompare(b.name as string, 'ja')
  })
  return merged.slice(0, limit)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawQ  = (searchParams.get('q') ?? '').trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 30)

  if (rawQ.length < 1) return NextResponse.json([])

  // 全角・半角スペースを除去して表記ゆれを吸収（「三上 悠亜」→「三上悠亜」）
  const normQ = rawQ.replace(/[\s　]+/g, '')

  const supabase = await createClient()

  // ① 女優マスターを name・ruby 両方で検索
  let rows = await searchActressesByNameOrRuby(supabase, rawQ, limit)

  // スペース除去クエリで再試行（元クエリと異なる場合のみ）
  if (rows.length === 0 && normQ !== rawQ) {
    rows = await searchActressesByNameOrRuby(supabase, normQ, limit)
  }

  // ② タグベースフォールバック：マスター結果が FALLBACK_THRESHOLD 未満のとき articles.tags から補完
  if (rows.length < FALLBACK_THRESHOLD) {
    const keyword = normQ || rawQ
    const { data: tagRows } = await supabase.rpc('search_actress_tags', {
      keyword,
      max_results: 20,
    })

    if (tagRows && (tagRows as unknown[]).length > 0) {
      const typed = tagRows as { tag_name: string; article_count: number }[]
      const tagNames = typed.map(r => r.tag_name)

      // タグ名で女優マスターを逆引きして取得（is_active・external_id など正式情報を補完）
      const { data: masterByTag } = await supabase
        .from('actresses')
        .select('id, external_id, name, ruby, image_url, metadata, is_active')
        .in('name', tagNames)

      const masterMap = new Map(
        (masterByTag ?? []).map(a => [a.name as string, a])
      )
      const existingIds = new Set(rows.map(r => r.external_id as string))

      for (const tagRow of typed) {
        if (rows.length >= limit) break
        const master = masterMap.get(tagRow.tag_name)
        if (master && !existingIds.has(master.external_id as string)) {
          rows = [...rows, master]
          existingIds.add(master.external_id as string)
        }
      }
    }
  }

  // ③ 各女優の作品数を並列取得（全件表示リンク用）
  const withCounts = await Promise.all(
    rows.map(async (actress) => {
      const { count } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .contains('tags', [actress.name])
        .eq('is_active', true)
      return { ...actress, article_count: count ?? 0 }
    })
  )

  return NextResponse.json(withCounts)
}
