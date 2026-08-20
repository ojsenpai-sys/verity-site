// GET /verity/api/spotlight/aizawa-miyu-catalog?filter=<key>&offset=<n>&limit=<n>
// 「MORE MIYU」カタログのページング/フィルタ切替用。SSR初期表示と同じ
// getActressCatalogPage() を呼ぶため、dedupeロジックの二重管理は発生しない。
import { NextResponse, type NextRequest } from 'next/server'
import { getActressCatalogPage, CATALOG_FILTERS, type CatalogFilter } from '@/lib/actressSpotlightCatalog'
import { AIZAWA_MIYU_META } from '@/lib/aizawaMiyu'

const VALID_FILTERS = new Set(CATALOG_FILTERS.map((f) => f.key))

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filterParam = searchParams.get('filter') ?? 'all'
  const filter: CatalogFilter = VALID_FILTERS.has(filterParam as CatalogFilter)
    ? (filterParam as CatalogFilter)
    : 'all'
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '24', 10) || 24, 1), 48)

  const result = await getActressCatalogPage({
    actressTag: AIZAWA_MIYU_META.actressTag,
    filter,
    offset,
    limit,
  })

  return NextResponse.json(result)
}
