import { getLovedollProducts } from '@/lib/lovedoll/getProducts'
import { LovedollHeroClient } from '@/components/LovedollHeroClient'

// VERITY LOVE DOLL特集 — トップページ大型Hero（Server Component）。
// データは事前生成スナップショット(products.json)のみ参照。SSR時にDMM APIを叩かない。
export async function LovedollHeroSection() {
  const { collaboration } = getLovedollProducts()
  if (collaboration.length === 0) return null
  return <LovedollHeroClient products={collaboration} />
}
