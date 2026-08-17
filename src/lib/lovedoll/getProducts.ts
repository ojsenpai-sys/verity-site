// src/lib/lovedoll/getProducts.ts — LOVE DOLL商品スナップショット読み取り層。
//
// 重要: ページ表示時に DMM API を直接呼ばない。scripts/sync-lovedoll-products.mjs が
// 事前生成した products.json を読むだけ。取得に失敗した商品(JSONに存在しないCID)は
// 静かにスキップし、ページ全体を壊さない(SALE TOP30と同じフェイルセーフ思想)。

import productsSnapshot from './products.json'
import {
  LOVEDOLL_COLLABORATION_CIDS,
  LOVEDOLL_VERITY_PICK_CIDS,
  LOVEDOLL_MORE_CIDS,
  LOVEDOLL_EDITORIAL_COMMENT,
} from './config'
import { parseSpec } from './specParser.mjs'

export type LovedollProduct = {
  cid: string
  title: string
  url: string
  imageList: string | null
  imageSmall: string | null
  price: number | null
  listPrice: number | null
  discountPct: number | null
  date: string | null
  stock: string | null
  inStock: boolean
  maker: string | null
  actress: string[]
  genre: string[]
  spec: { heightCm: number | null; cup: string | null; material: string | null }
  editorialComment: string | null
}

type RawProduct = {
  content_id: string
  title: string
  URL: string
  imageURL: { list: string | null; small: string | null }
  prices: { price: string | null; list_price: string | null }
  date: string | null
  stock: string | null
  maker: string | null
  actress: string[]
  genre: string[]
}

function toNumber(v: string | null): number | null {
  if (v == null) return null
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? null : n
}

function buildProduct(cid: string): LovedollProduct | null {
  const raw = (productsSnapshot as { products: Record<string, RawProduct> }).products[cid]
  if (!raw) {
    console.warn(`[lovedoll] products.json に ${cid} が見つかりません — スキップします`)
    return null
  }
  const price = toNumber(raw.prices?.price ?? null)
  const listPrice = toNumber(raw.prices?.list_price ?? null)
  // list_price が存在し、price より大きい場合のみ割引率を計算する（存在しない商品で無理に作らない）。
  const discountPct =
    listPrice != null && price != null && listPrice > price
      ? Math.round((1 - price / listPrice) * 100)
      : null

  return {
    cid: raw.content_id,
    title: raw.title,
    url: raw.URL,
    imageList: raw.imageURL?.list ?? null,
    imageSmall: raw.imageURL?.small ?? null,
    price,
    listPrice,
    discountPct,
    date: raw.date ?? null,
    stock: raw.stock ?? null,
    // stock値の意味は "stock"(在庫あり)のみ確認済み。それ以外の値は意味不明のため在庫ありと断定しない。
    inStock: raw.stock === 'stock',
    maker: raw.maker ?? null,
    actress: raw.actress ?? [],
    genre: raw.genre ?? [],
    spec: parseSpec({ title: raw.title }),
    editorialComment: LOVEDOLL_EDITORIAL_COMMENT[cid] ?? null,
  }
}

function buildList(cids: readonly string[]): LovedollProduct[] {
  return cids.map(buildProduct).filter((p): p is LovedollProduct => p !== null)
}

export type LovedollPageData = {
  collaboration: LovedollProduct[]
  verityPick: LovedollProduct[]
  more: LovedollProduct[]
  generatedAt: string
}

/** 全13商品を config の掲載順のまま返す。同期関数（DBもAPIも叩かない、JSON importのみ）。 */
export function getLovedollProducts(): LovedollPageData {
  return {
    collaboration: buildList(LOVEDOLL_COLLABORATION_CIDS),
    verityPick: buildList(LOVEDOLL_VERITY_PICK_CIDS),
    more: buildList(LOVEDOLL_MORE_CIDS),
    generatedAt: (productsSnapshot as { generatedAt: string }).generatedAt,
  }
}
