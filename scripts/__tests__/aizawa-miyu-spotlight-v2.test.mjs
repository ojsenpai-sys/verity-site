// scripts/__tests__/aizawa-miyu-spotlight-v2.test.mjs
// Spotlight v2（逢沢みゆ特集）の pure ヘルパーの検証。
// node --test scripts/__tests__/aizawa-miyu-spotlight-v2.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFirstReleased, getReservationStatus } from '../../src/lib/spotlightV2Selection.mjs'
import {
  isVr,
  isSingleActress,
  dedupeCatalog,
  pickCatalogRepresentative,
  matchesFilter,
  compareRecency,
  paginate,
  BEST_TAG,
} from '../../src/lib/spotlightCatalogSelection.mjs'

const NOW = '2026-08-20T13:00:00.000Z'

// ── 2. Vol.101 future判定 ────────────────────────────────────────────────────
test('2. Vol.101 future判定: 未来のpublished_atは予約受付中バッジ', () => {
  const r = getReservationStatus('2026-09-10T15:00:00.000Z', NOW)
  assert.equal(r.isFuture, true)
  assert.equal(r.badge, '予約受付中')
  assert.equal(r.ctaLabel, 'FANZAで予約する')
})

// ── 3. Vol.101 released判定 ──────────────────────────────────────────────────
test('3. Vol.101 released判定: 過去のpublished_atはNOW STREAMING', () => {
  const r = getReservationStatus('2026-08-14T00:00:00.000Z', NOW)
  assert.equal(r.isFuture, false)
  assert.equal(r.badge, 'NOW STREAMING')
  assert.equal(r.ctaLabel, '今すぐ観る')
})

// ── 4. AVAILABLE NOW fallback ────────────────────────────────────────────────
test('4. AVAILABLE NOW fallback: 優先候補が未来日なら次点へフォールバック', () => {
  const future = { id: 'cjod00528', published_at: '2026-08-21T00:00:00.000Z' }
  const past = { id: 'pred00887', published_at: '2026-08-14T00:00:00.000Z' }
  const result = pickFirstReleased([future, past], NOW)
  assert.equal(result.id, 'pred00887')
})

test('4b. AVAILABLE NOW fallback: 優先候補が配信済みならそのまま採用', () => {
  const released = { id: 'cjod00528', published_at: '2026-08-01T00:00:00.000Z' }
  const past = { id: 'pred00887', published_at: '2026-08-14T00:00:00.000Z' }
  const result = pickFirstReleased([released, past], NOW)
  assert.equal(result.id, 'cjod00528')
})

test('4c. AVAILABLE NOW fallback: 全候補が未来日ならnull', () => {
  const result = pickFirstReleased([{ id: 'a', published_at: '2099-01-01T00:00:00.000Z' }], NOW)
  assert.equal(result, null)
})

// ── 5. MORE MIYU actress一致（単独主演フィルタ） ───────────────────────────────
test('5. MORE MIYU actress一致: 単独主演はtrue', () => {
  assert.equal(isSingleActress({ metadata: { actress: [{ id: 1088602, name: '逢沢みゆ' }] } }), true)
})
test('5b. MORE MIYU actress一致: 複数女優はfalse(二重計上防止)', () => {
  assert.equal(isSingleActress({ metadata: { actress: [{ id: 1 }, { id: 2 }] } }), false)
})
test('5c. MORE MIYU actress一致: actress情報なしはfalse', () => {
  assert.equal(isSingleActress({ metadata: {} }), false)
  assert.equal(isSingleActress({ metadata: null }), false)
})

// ── 6. future除外（dedupe/sortが未来日混入時も安全に動作することの防御的確認。
//      実際の除外はDBクエリの .lte('published_at', now) で行う） ─────────────
test('6. future除外: 未来日混在データでもdedupe/sortがクラッシュしない', () => {
  const rows = [
    { external_id: 'a001', title: '作品A', metadata: { floor: 'videoa' }, fetched_at: '2026-08-01T00:00:00Z', published_at: '2099-01-01T00:00:00Z' },
    { external_id: 'a002', title: '作品B', metadata: { floor: 'videoa' }, fetched_at: '2026-08-01T00:00:00Z', published_at: '2026-08-01T00:00:00Z' },
  ]
  const deduped = dedupeCatalog(rows)
  assert.equal(deduped.length, 2)
  deduped.sort(compareRecency)
  assert.equal(deduped[0].external_id, 'a001') // sort自体は未来日も普通に扱う(除外はしない) — 除外の責務はSQL側
})

// ── 7. canonical dedupe ──────────────────────────────────────────────────────
test('7. canonical dedupe: title prefix一致は代表1件へ統合', () => {
  // tkプレフィックス付きCIDは canonicalCidBase 上「別プレフィックス」として扱われ
  // 意図的にdedupe対象外となる(Phase F-2/F-3の既知の割り切り)。
  // ここでは tk を含まない本編/特典版(BOD)パターンで検証する。
  const rows = [
    { external_id: 'miab00677', title: 'ドリームウーマンVol.101 逢沢みゆ', metadata: { floor: 'videoa' } },
    { external_id: 'miab677bod', title: 'ドリームウーマンVol.101 逢沢みゆ （BOD）', metadata: { floor: 'dvd' } },
  ]
  const deduped = dedupeCatalog(rows)
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0].external_id, 'miab00677') // videoa優先
})

test('7c. canonical dedupe: tkプレフィックス違いは意図的にdedupeしない(既知の割り切り)', () => {
  const rows = [
    { external_id: 'miab00677', title: 'ドリームウーマンVol.101 逢沢みゆ', metadata: { floor: 'videoa' } },
    { external_id: 'tkmiab677', title: '【FANZA限定】ドリームウーマンVol.101 逢沢みゆ 生写真4枚セット', metadata: { floor: 'dvd' } },
  ]
  const deduped = dedupeCatalog(rows)
  assert.equal(deduped.length, 2) // tkプレフィックス差でcanonicalCidBaseが別になるため統合されない
})

test('7b. canonical dedupe: title不一致は誤結合せず全件残す', () => {
  const rows = [
    { external_id: 'sone00004', title: '新人NO.1STYLE 逢沢みゆ AVデビュー', metadata: { floor: 'videoa' } },
    { external_id: 'sone00005', title: '本物アイドルがAV転身！性感を急成長させちゃう初体験！', metadata: { floor: 'videoa' } },
  ]
  const deduped = dedupeCatalog(rows)
  // 異なるCID(canonicalCidBase不一致)なのでそもそも別グループ = 2件のまま
  assert.equal(deduped.length, 2)
})

// ── 8. videoa優先 ─────────────────────────────────────────────────────────────
test('8. videoa優先: 同一グループでvideoaが存在すればvideoaを代表に選ぶ', () => {
  const group = [
    { external_id: 'pred887', title: '勃起がおさまらなくて みゆ先生に介抱してもらったら…', metadata: { floor: 'dvd' } },
    { external_id: 'pred00887', title: '勃起がおさまらなくて みゆ先生に介抱してもらったら…', metadata: { floor: 'videoa' } },
  ]
  const rep = pickCatalogRepresentative(group)
  assert.equal(rep.external_id, 'pred00887')
})

// ── 9. dvd fallback ───────────────────────────────────────────────────────────
test('9. dvd fallback: videoaが存在しない場合はdvdを代表に選ぶ', () => {
  const group = [
    { external_id: 'royd317', title: 'ボーイッシュで男友達みたいな女子は想像以上の大人下着とむっちむち巨乳ナイスボディ', metadata: { floor: 'dvd' } },
  ]
  const rep = pickCatalogRepresentative(group)
  assert.equal(rep.external_id, 'royd317')
})

// ── 10. VR badge判定 ──────────────────────────────────────────────────────────
test('10. VR badge判定: "VR専用"タグがあればVR作品', () => {
  assert.equal(isVr(['ハイクオリティVR', '8KVR', 'VR専用', '中出し']), true)
})
test('10b. VR badge判定: VRタグがなければ非VR', () => {
  assert.equal(isVr(['ハイビジョン', '独占配信', '中出し']), false)
})
test('10c. VR badge判定: tags null/undefinedでも例外にならない', () => {
  assert.equal(isVr(null), false)
  assert.equal(isVr(undefined), false)
})

// ── 11. BEST filter ───────────────────────────────────────────────────────────
test('11. BEST filter: bestフィルタはBESTタグ付きのみ対象', () => {
  const bestRow = { tags: ['逢沢みゆ', BEST_TAG, '4時間以上作品'] }
  const normalRow = { tags: ['逢沢みゆ', '中出し'] }
  assert.equal(matchesFilter(bestRow, 'best'), true)
  assert.equal(matchesFilter(normalRow, 'best'), false)
})
test('11b. BEST filter: 通常フィルタ(all含む)からはBESTタグ付き作品を除外', () => {
  const bestRow = { tags: ['逢沢みゆ', BEST_TAG, '美少女'] }
  assert.equal(matchesFilter(bestRow, 'all'), false)
  assert.equal(matchesFilter(bestRow, 'bishoujo'), false)
})

// ── 12. 48件limit（ページング境界） ─────────────────────────────────────────
test('12. 48件limit: offset/limitの境界とhasMoreが正しい', () => {
  const items = Array.from({ length: 60 }, (_, i) => i)
  const first = paginate(items, 0, 48)
  assert.equal(first.page.length, 48)
  assert.equal(first.total, 60)
  assert.equal(first.hasMore, true)

  const second = paginate(items, 48, 48)
  assert.equal(second.page.length, 12)
  assert.equal(second.hasMore, false)
})
test('12b. 48件limit: ちょうど境界(total===offset+limit)はhasMore=false', () => {
  const items = Array.from({ length: 48 }, (_, i) => i)
  const r = paginate(items, 0, 48)
  assert.equal(r.hasMore, false)
})

// ── 13. filter分類 ────────────────────────────────────────────────────────────
test('13. filter分類: ジャンルタグ一致判定が各filterで正しい', () => {
  const row = { tags: ['逢沢みゆ', '美少女', '巨乳', '独占配信'] }
  assert.equal(matchesFilter(row, 'bishoujo'), true)
  assert.equal(matchesFilter(row, 'kyonyu'), true)
  assert.equal(matchesFilter(row, 'chijo'), false)
  assert.equal(matchesFilter(row, 'joshikosei'), false)
  assert.equal(matchesFilter(row, 'all'), true)
})
