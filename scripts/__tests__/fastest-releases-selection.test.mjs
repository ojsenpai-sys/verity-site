// scripts/__tests__/fastest-releases-selection.test.mjs
// 実行: node --test scripts/__tests__/fastest-releases-selection.test.mjs
//
// src/lib/fastestReleasesSelection.mjs の pure 選定ロジック
// (pickDisplayFloor / isFuturePublished / selectFastestCards)を対象とする。
//
// 対象外(DB/SQL側の責務のためunit test対象外。Phase F-2調査で実データ確認済み):
//   - 「同一fetched_atの行が1つのbatchとしてグルーピングされる」こと自体
//     (MAX(fetched_at)取得→完全一致抽出はSQLクエリの責務)
//   - 「複数メーカーでMAX(fetched_at)最大のメーカーが最上位になる」こと自体
//     (メーカー間ソートはfastestReleases.ts側の配列sortで、DBから返る
//      updateDateKeyの値を信頼して比較するのみ)
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickDisplayFloor,
  isFuturePublished,
  selectFastestCards,
  canonicalCidBase,
  isSameWorkTitleGroup,
  dedupeSameWork,
} from '../../src/lib/fastestReleasesSelection.mjs'

const NOW = '2026-08-18T00:00:00.000+00:00'

// ── pickDisplayFloor ────────────────────────────────────────────────────────
test('pickDisplayFloor: videoa行が1件でもあればvideoaを選ぶ(dvdは無視)', () => {
  const rows = [{ floor: 'dvd' }, { floor: 'videoa' }, { floor: 'dvd' }]
  assert.equal(pickDisplayFloor(rows), 'videoa')
})
test('pickDisplayFloor: videoaが0件ならdvdをフォールバックとして選ぶ', () => {
  const rows = [{ floor: 'dvd' }, { floor: 'dvd' }]
  assert.equal(pickDisplayFloor(rows), 'dvd')
})
test('pickDisplayFloor: どちらも無ければnull', () => {
  assert.equal(pickDisplayFloor([]), null)
})

// ── isFuturePublished ───────────────────────────────────────────────────────
test('isFuturePublished: 現在時刻以降(未来)はtrue', () => {
  assert.equal(isFuturePublished('2026-09-09T15:00:00+00:00', NOW), true)
  assert.equal(isFuturePublished(NOW, NOW), true) // ちょうど現在時刻も未来扱い(>=)
})
test('isFuturePublished: 過去はfalse、nullもfalse', () => {
  assert.equal(isFuturePublished('2026-08-13T15:00:00+00:00', NOW), false)
  assert.equal(isFuturePublished(null, NOW), false)
})

// ── selectFastestCards: floor優先(既存提案 2,3,12) ────────────────────────
test('videoa存在時はvideoaのみ選定される(dvdは混在しない)', () => {
  const rows = [
    { external_id: 'dvd1', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'v1', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['v1'])
})
test('videoaが0件のときのみdvdがフォールバックとして選定される', () => {
  const rows = [
    { external_id: 'dvd1', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'dvd2', floor: 'dvd', published_at: '2026-08-11T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id).sort(), ['dvd1', 'dvd2'])
})
test('floor組み合わせが両方とも成立する(同一呼び出しで独立に判定)', () => {
  const withVideoa = [
    { external_id: 'v1', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'dvd1', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const dvdOnly = [
    { external_id: 'dvd2', floor: 'dvd', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  assert.deepEqual(selectFastestCards(withVideoa, NOW, 10).map((r) => r.external_id), ['v1'])
  assert.deepEqual(selectFastestCards(dvdOnly, NOW, 10).map((r) => r.external_id), ['dvd2'])
})

// ── selectFastestCards: published_atはフィルタではなく整理(既存提案5,6 + 新規8,9,10,11) ──
test('未来作品は除外されない。現在に近い未来から昇順で並ぶ(ケース8,10)', () => {
  const rows = [
    { external_id: 'far', floor: 'videoa', published_at: '2026-12-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'near', floor: 'videoa', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mid', floor: 'videoa', published_at: '2026-09-01T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['near', 'mid', 'far']) // 遠い未来が先に来ない
})
test('未来作品が過去作品より優先され、未来作品だけで足りる場合は過去作品を含めない(ケース6)', () => {
  const rows = [
    { external_id: 'future1', floor: 'videoa', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'past1', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 1)
  assert.deepEqual(result.map((r) => r.external_id), ['future1'])
})
test('未来作品が limit 未満の場合、過去作品を published_at 降順(新しい順)で補完する(ケース9)', () => {
  const rows = [
    { external_id: 'future1', floor: 'videoa', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'past_old', floor: 'videoa', published_at: '2026-08-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'past_new', floor: 'videoa', published_at: '2026-08-13T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['future1', 'past_new', 'past_old'])
})
test('取得漏れの遠い過去作品が同一batchに混在しても、現在に近い新作が優先される(ケース11)', () => {
  const rows = [
    { external_id: 'stale_old', floor: 'videoa', published_at: '2026-01-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'near_future', floor: 'videoa', published_at: '2026-08-19T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'recent_past', floor: 'videoa', published_at: '2026-08-17T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 2)
  assert.deepEqual(result.map((r) => r.external_id), ['near_future', 'recent_past'])
})
test('published_atがnullの行は除外される', () => {
  const rows = [
    { external_id: 'a', floor: 'videoa', published_at: null, fetched_at: NOW },
    { external_id: 'b', floor: 'videoa', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['b'])
})
test('MOODYZ実データ相当: 全て未来予約(9月配信)でも除外されず現在に近い順で選定される', () => {
  const rows = [
    { external_id: 'mihd00010', floor: 'videoa', published_at: '2026-09-09T15:00:00+00:00', fetched_at: NOW },
    { external_id: 'mive00001', floor: 'videoa', published_at: '2026-08-31T15:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['mive00001', 'mihd00010']) // 近い方が先
})
test('limitを超える件数がある場合は先頭からlimit件のみ返す', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    external_id: `c${i}`,
    floor: 'videoa',
    published_at: `2026-08-${String(10 + i).padStart(2, '0')}T00:00:00+00:00`,
    fetched_at: NOW,
  }))
  const result = selectFastestCards(rows, NOW, 10)
  assert.equal(result.length, 10)
})
test('候補が0件なら空配列(floorが存在しない場合)', () => {
  assert.deepEqual(selectFastestCards([], NOW, 10), [])
})

// ── canonicalCidBase(Phase F-3) ─────────────────────────────────────────────
test('canonicalCidBase: ゼロ埋めの有無を無視する(mngs00082 ⇔ mngs082)', () => {
  assert.equal(canonicalCidBase('mngs00082'), canonicalCidBase('mngs082'))
})
test('canonicalCidBase: 末尾の英字サフィックス(bod等)を無視する', () => {
  assert.equal(canonicalCidBase('mngs082'), canonicalCidBase('mngs082bod'))
  assert.equal(canonicalCidBase('mngs00082'), canonicalCidBase('mngs082bod'))
})
test('canonicalCidBase: 異なるプレフィックスは別キーになる', () => {
  assert.notEqual(canonicalCidBase('mngs00082'), canonicalCidBase('mida00082'))
})
test('canonicalCidBase: 数値で終わらないCIDは正規化できず元の文字列(小文字化)を返す', () => {
  assert.equal(canonicalCidBase('1namhs00005z'), '1namhs00005z')
})

// ── isSameWorkTitleGroup(Phase F-3) ─────────────────────────────────────────
test('isSameWorkTitleGroup: 最短titleが全titleの接頭辞なら true(特典版パターン)', () => {
  const titles = [
    '単位が欲しい留年ギャルのお・ね・だ・り',
    '単位が欲しい留年ギャルのお・ね・だ・り （BOD）',
  ]
  assert.equal(isSameWorkTitleGroup(titles), true)
})
test('isSameWorkTitleGroup: 女優名追記パターンもtrue', () => {
  const titles = ['白川汁、大爆散！', '白川汁、大爆散！ 白川美玲']
  assert.equal(isSameWorkTitleGroup(titles), true)
})
test('isSameWorkTitleGroup: 接頭辞関係が崩れる場合はfalse(誤dedupe防止)', () => {
  // 同じ長さの別文字(全角チルダ違い等)は「接頭辞」にならない
  const titles = ['ず〜っとシコシコ', 'ず～っとシコシコ']
  assert.equal(isSameWorkTitleGroup(titles), false)
})
test('isSameWorkTitleGroup: titleがnull/undefinedを含む場合はfalse', () => {
  assert.equal(isSameWorkTitleGroup(['タイトルA', null]), false)
  assert.equal(isSameWorkTitleGroup(['タイトルA', undefined]), false)
})
test('isSameWorkTitleGroup: 3件でも最短が全ての接頭辞ならtrue', () => {
  const titles = [
    '単位が欲しい留年ギャルのお・ね・だ・り 卍フェラごっくん',
    '単位が欲しい留年ギャルのお・ね・だ・り 卍フェラごっくん （BOD）',
    '単位が欲しい留年ギャルのお・ね・だ・り 卍フェラごっくん 春陽モカ',
  ]
  assert.equal(isSameWorkTitleGroup(titles), true)
})

// ── dedupeSameWork(Phase F-3・STEP9必須ケース) ──────────────────────────────
test('[ケース6] 同一作品3SKU(本編+BOD+別variant)→1件(最短titleの本編を代表)', () => {
  const rows = [
    { external_id: 'mngs082bod', title: '単位が欲しい留年ギャルのお・ね・だ・り （BOD）' },
    { external_id: 'mngs082', title: '単位が欲しい留年ギャルのお・ね・だ・り' },
    { external_id: 'mngs00082v', title: '単位が欲しい留年ギャルのお・ね・だ・り （数量限定）' },
  ]
  const result = dedupeSameWork(rows)
  assert.deepEqual(result.map((r) => r.external_id), ['mngs082'])
})
test('[ケース4] 同一女優の別作品(canonicalCidBaseが異なる)→dedupeしない', () => {
  const rows = [
    { external_id: 'mida00781', title: '義妹シリーズ 第1弾 奥井千晴' },
    { external_id: 'mida00782', title: '義妹シリーズ 第2弾 奥井千晴' },
  ]
  const result = dedupeSameWork(rows)
  assert.deepEqual(result.map((r) => r.external_id).sort(), ['mida00781', 'mida00782'])
})
test('[ケース5] 類似タイトルだが別作品(canonicalCidBaseが異なる)→dedupeしない', () => {
  const rows = [
    { external_id: 'abc123', title: '人気シリーズ最新作' },
    { external_id: 'xyz456', title: '人気シリーズ最新作 総集編' }, // 偶然の接頭辞一致だがCID基部は無関係
  ]
  const result = dedupeSameWork(rows)
  assert.deepEqual(result.map((r) => r.external_id).sort(), ['abc123', 'xyz456'])
})
test('canonicalCidBase一致でもtitleの接頭辞関係が崩れる場合はdedupeしない(誤merge防止)', () => {
  const rows = [
    { external_id: 'pbd526', title: 'ず〜っとシコシコしてくる主観手コキ' },
    { external_id: 'pbd00526', title: 'ず～っとシコシコしてくる主観手コキ' },
  ]
  const result = dedupeSameWork(rows)
  assert.deepEqual(result.map((r) => r.external_id).sort(), ['pbd00526', 'pbd526'])
})
test('[ケース10] canonicalCidBaseが同じでも呼び出し単位が別メーカーなら混ざらない(関数はmaker非依存の純関数)', () => {
  // dedupeSameWorkは渡された配列内でのみグルーピングする(グローバル状態を持たない)。
  // メーカーをまたいだ誤結合を防ぐのは呼び出し側(メーカーごとに1回呼ぶ)の責務。
  const makerA = dedupeSameWork([{ external_id: 'mngs00082', title: 'タイトルA' }])
  const makerB = dedupeSameWork([{ external_id: 'mngs082', title: 'タイトルA' }])
  assert.equal(makerA.length, 1)
  assert.equal(makerB.length, 1)
  assert.equal(makerA[0].external_id, 'mngs00082')
  assert.equal(makerB[0].external_id, 'mngs082')
})

// ── selectFastestCards + dedupe 統合(STEP9必須ケース 1,2,3,7,8,9) ──────────
test('[ケース1,2] videoa+dvd重複はfloor決定で既にvideoaのみに絞られる(dedupe以前に構造的に解消)', () => {
  const rows = [
    { external_id: 'mngs00072', floor: 'videoa', title: '作品X', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mngs072', floor: 'dvd', title: '作品X', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['mngs00072'])
})
test('[ケース3] videoaが無い場合、同floor(dvd)内の本編+BOD重複がdedupeされ1件になる', () => {
  const rows = [
    { external_id: 'mngs082', floor: 'dvd', title: '作品Y', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mngs082bod', floor: 'dvd', title: '作品Y （BOD）', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['mngs082'])
})
test('[ケース7] dedupeで件数が減った分、同一batch内の次候補が繰り上げ補充される', () => {
  const rows = [
    { external_id: 'mngs082', floor: 'dvd', title: '作品Y', published_at: '2026-08-15T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mngs082bod', floor: 'dvd', title: '作品Y （BOD）', published_at: '2026-08-15T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'other1', floor: 'dvd', title: '作品Z', published_at: '2026-08-14T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'other2', floor: 'dvd', title: '作品W', published_at: '2026-08-13T00:00:00+00:00', fetched_at: NOW },
  ]
  // limit=3: dedupe前は4行、dedupe後は3件(重複1件除外)→limit内にother1,other2まで繰り上げられる
  const result = selectFastestCards(rows, NOW, 3)
  assert.deepEqual(result.map((r) => r.external_id), ['mngs082', 'other1', 'other2'])
})
test('[ケース8] dedupe後もpublished_at整理の表示順(現在に近い未来優先)は維持される', () => {
  const rows = [
    { external_id: 'mida001', floor: 'videoa', title: '作品遠', published_at: '2026-12-01T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mida002', floor: 'videoa', title: '作品近', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mida002bod', floor: 'videoa', title: '作品近 （BOD）', published_at: '2026-08-20T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.deepEqual(result.map((r) => r.external_id), ['mida002', 'mida001'])
})
test('[ケース9] floor CTA整合: dedupe後の代表行もfloorプロパティを保持する', () => {
  const rows = [
    { external_id: 'mngs082', floor: 'dvd', title: '作品Y', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
    { external_id: 'mngs082bod', floor: 'dvd', title: '作品Y （BOD）', published_at: '2026-08-10T00:00:00+00:00', fetched_at: NOW },
  ]
  const result = selectFastestCards(rows, NOW, 10)
  assert.equal(result[0].floor, 'dvd')
})
