// src/lib/lovedoll/specParser.mjs — LOVE DOLL商品タイトル/ジャンルからの安全なspec抽出。
//
// 重要な設計方針:
//   ・DMM APIレスポンスに構造化spec(身長/重量/素材等)フィールドは存在しない(Phase A実測確認済み)。
//   ・タイトル文字列に慣習的に含まれる範囲(身長cm・カップ・素材)だけを、
//     誤抽出しにくい限定的な正規表現で抽出する。
//   ・抽出できない場合は必ず null を返す。推測・補完は一切行わない。
//   ・重量/W/H/ボディタイプ等、タイトルに現れない項目は対象外(常にnull)。
//
// pure function — 副作用なし・API呼び出しなし。node:test で直接テスト可能。

/** @param {string} title @returns {number | null} */
export function parseHeightCm(title) {
  if (!title) return null
  const m = title.match(/(\d{2,3})\s*cm/i)
  if (!m) return null
  const cm = parseInt(m[1], 10)
  // 誤抽出防止: 現実的なドール身長域(80〜200cm)外は棄却する。
  if (cm < 80 || cm > 200) return null
  return cm
}

/** @param {string} title @returns {string | null} */
export function parseCup(title) {
  if (!title) return null
  const m = title.match(/([A-K])\s*カップ/)
  return m ? m[1] : null
}

/** @param {string} title @returns {string | null} */
export function parseMaterial(title) {
  if (!title) return null
  // 「フルシリコン」を先に判定しないと「シリコン」に部分一致してしまうため順序が重要。
  const m = title.match(/(フルシリコン|TPE|シリコン)/)
  return m ? m[1] : null
}

/**
 * @param {{ title: string, genre?: string[] }} product
 * @returns {{ heightCm: number | null, cup: string | null, material: string | null }}
 */
export function parseSpec(product) {
  const title = product?.title ?? ''
  return {
    heightCm: parseHeightCm(title),
    cup: parseCup(title),
    material: parseMaterial(title),
  }
}
