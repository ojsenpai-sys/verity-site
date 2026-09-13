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
  selectFastestCardsVariable,
  sortMakerSections,
  canonicalCidBase,
  isSameWorkTitleGroup,
  dedupeSameWork,
  chunkArray,
  mergeCandidateChunks,
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

// ═════════════════════════════════════════════════════════════════════════════
// selectFastestCardsVariable (Phase 1: 最新作最速更新情報 Refresh・5〜10可変表示+補完)
// ═════════════════════════════════════════════════════════════════════════════
const BATCH_TIME = '2026-08-17T10:00:00+00:00'
const POOL_TIMES = [
  '2026-08-16T10:00:00+00:00',
  '2026-08-15T10:00:00+00:00',
  '2026-08-14T10:00:00+00:00',
  '2026-08-13T10:00:00+00:00',
]

function variableRow(id, { fetchedAt, publishedAt, floor = 'videoa', title }) {
  return { external_id: id, floor, title: title ?? id, published_at: publishedAt, fetched_at: fetchedAt }
}
function makeBatch(n) {
  return Array.from({ length: n }, (_, i) =>
    variableRow(`b${i}`, { fetchedAt: BATCH_TIME, publishedAt: `2026-08-17T${String(9 - i).padStart(2, '0')}:00:00+00:00` }),
  )
}
function makePool(n) {
  return POOL_TIMES.slice(0, n).map((t, i) => variableRow(`p${i}`, { fetchedAt: t, publishedAt: t }))
}

for (const n of [1, 2, 3, 4]) {
  test(`selectFastestCardsVariable: batch${n}件→不足分(${5 - n}件)をpoolから補完し合計5件になる(ケース${n})`, () => {
    const rows = [...makeBatch(n), ...makePool(4)]
    const result = selectFastestCardsVariable(rows, NOW)
    assert.equal(result.length, 5)
    assert.deepEqual(result.slice(0, n).map((r) => r.external_id), makeBatch(n).map((r) => r.external_id))
    assert.deepEqual(result.slice(n).map((r) => r.external_id), makePool(5 - n).map((r) => r.external_id))
  })
}

test('selectFastestCardsVariable: batch5件→補完なしでそのまま5件(ケース5)', () => {
  const rows = [...makeBatch(5), ...makePool(4)]
  const result = selectFastestCardsVariable(rows, NOW)
  assert.deepEqual(result.map((r) => r.external_id), makeBatch(5).map((r) => r.external_id))
})
test('selectFastestCardsVariable: batch6件→そのまま6件表示(ケース6)', () => {
  assert.equal(selectFastestCardsVariable(makeBatch(6), NOW).length, 6)
})
test('selectFastestCardsVariable: batch7件→そのまま7件表示(実装後Validation例: maker B)', () => {
  assert.equal(selectFastestCardsVariable(makeBatch(7), NOW).length, 7)
})
test('selectFastestCardsVariable: batch13件→最大10件にクランプ(実装後Validation例: maker C)', () => {
  assert.equal(selectFastestCardsVariable(makeBatch(13), NOW).length, 10)
})
test('selectFastestCardsVariable: batch9件→そのまま9件表示(ケース9)', () => {
  assert.equal(selectFastestCardsVariable(makeBatch(9), NOW).length, 9)
})
test('selectFastestCardsVariable: batch10件→そのまま10件表示(ケース10)', () => {
  assert.equal(selectFastestCardsVariable(makeBatch(10), NOW).length, 10)
})
test('selectFastestCardsVariable: batch11件以上→最大10件にクランプされる(ケース11)', () => {
  assert.equal(selectFastestCardsVariable(makeBatch(13), NOW).length, 10)
})
test('selectFastestCardsVariable: 補完候補が不足する場合は存在する分だけ返す(無理な水増しをしない)', () => {
  const rows = [...makeBatch(1), ...makePool(2)] // 全体で3件しか存在しない
  const result = selectFastestCardsVariable(rows, NOW)
  assert.equal(result.length, 3)
})
test('selectFastestCardsVariable: batchと補完候補にまたがる同一作品(派生SKU)は重複表示されない', () => {
  const rows = [
    variableRow('mngs082', { fetchedAt: BATCH_TIME, publishedAt: '2026-08-17T09:00:00+00:00', title: '単位が欲しい留年ギャルのお・ね・だ・り' }),
    // pool側のBOD版はbatch側の'mngs082'と同一作品(canonicalCidBase一致+title接頭辞一致)としてdedupeされる
    variableRow('mngs082bod', { fetchedAt: POOL_TIMES[0], publishedAt: POOL_TIMES[0], title: '単位が欲しい留年ギャルのお・ね・だ・り （BOD）' }),
    variableRow('other1', { fetchedAt: POOL_TIMES[1], publishedAt: POOL_TIMES[1], title: '作品Y' }),
    variableRow('other2', { fetchedAt: POOL_TIMES[2], publishedAt: POOL_TIMES[2], title: '作品Z' }),
    variableRow('other3', { fetchedAt: POOL_TIMES[3], publishedAt: POOL_TIMES[3], title: '作品W' }),
  ]
  const result = selectFastestCardsVariable(rows, NOW)
  const ids = result.map((r) => r.external_id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(!ids.includes('mngs082bod'))
  assert.deepEqual(ids, ['mngs082', 'other1', 'other2', 'other3'])
})
test('selectFastestCardsVariable: published_atがnullの候補は除外される(batch/pool両方)', () => {
  const rows = [
    variableRow('b0', { fetchedAt: BATCH_TIME, publishedAt: null }),
    variableRow('b1', { fetchedAt: BATCH_TIME, publishedAt: '2026-08-17T09:00:00+00:00' }),
    variableRow('p0', { fetchedAt: POOL_TIMES[0], publishedAt: null }),
    variableRow('p1', { fetchedAt: POOL_TIMES[1], publishedAt: POOL_TIMES[1] }),
  ]
  const result = selectFastestCardsVariable(rows, NOW)
  assert.deepEqual(result.map((r) => r.external_id), ['b1', 'p1'])
})
test('selectFastestCardsVariable: batchのfloorと異なるfloorの補完候補は使われない', () => {
  const rows = [
    variableRow('b0', { fetchedAt: BATCH_TIME, publishedAt: '2026-08-17T09:00:00+00:00', floor: 'videoa' }),
    variableRow('p0', { fetchedAt: POOL_TIMES[0], publishedAt: POOL_TIMES[0], floor: 'dvd' }),
  ]
  const result = selectFastestCardsVariable(rows, NOW)
  assert.deepEqual(result.map((r) => r.external_id), ['b0'])
})
test('selectFastestCardsVariable: 補完候補はfetched_at降順(直近に登録された順)で並ぶ(published_atの順とは独立)', () => {
  const rows = [
    variableRow('b0', { fetchedAt: BATCH_TIME, publishedAt: '2026-08-17T09:00:00+00:00' }),
    variableRow('p1', { fetchedAt: POOL_TIMES[0], publishedAt: '2026-08-01T00:00:00+00:00' }),
    variableRow('p2', { fetchedAt: POOL_TIMES[1], publishedAt: '2026-08-16T00:00:00+00:00' }),
    variableRow('p3', { fetchedAt: POOL_TIMES[2], publishedAt: '2026-08-10T00:00:00+00:00' }),
    variableRow('p4', { fetchedAt: POOL_TIMES[3], publishedAt: '2026-08-05T00:00:00+00:00' }),
  ]
  const result = selectFastestCardsVariable(rows, NOW)
  assert.deepEqual(result.map((r) => r.external_id), ['b0', 'p1', 'p2', 'p3', 'p4'])
})
test('selectFastestCardsVariable: メーカーをまたいだ混入がない(関数はmaker非依存の純関数・呼び出し単位で完結)', () => {
  const makerA = selectFastestCardsVariable(makeBatch(2), NOW)
  const makerB = selectFastestCardsVariable([...makeBatch(1), ...makePool(4)], NOW)
  assert.equal(makerA.length, 2) // poolを渡していないので無理な水増しはしない
  assert.equal(makerB.length, 5)
  assert.ok(makerA.every((r) => r.external_id.startsWith('b')))
})
test('selectFastestCardsVariable: 候補0件は空配列', () => {
  assert.deepEqual(selectFastestCardsVariable([], NOW), [])
})

// ═════════════════════════════════════════════════════════════════════════════
// sortMakerSections (Phase 1: メーカー表示順・安定タイブレーク)
// ═════════════════════════════════════════════════════════════════════════════
test('sortMakerSections: 最新batchのfetched_at降順に並ぶ', () => {
  const makers = [
    { makerId: 'a', latestFetchedAt: '2026-08-15T00:00:00+00:00' },
    { makerId: 'b', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
    { makerId: 'c', latestFetchedAt: '2026-08-16T00:00:00+00:00' },
  ]
  const result = sortMakerSections(makers, ['a', 'b', 'c'])
  assert.deepEqual(result.map((m) => m.makerId), ['b', 'c', 'a'])
})
test('sortMakerSections: 同一fetched_atはmakerIdOrderの出現順で安定タイブレークする(何度実行しても同じ順序)', () => {
  const makers = [
    { makerId: 'z', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
    { makerId: 'a', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
    { makerId: 'm', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
  ]
  const order = ['a', 'm', 'z']
  assert.deepEqual(sortMakerSections(makers, order).map((m) => m.makerId), ['a', 'm', 'z'])
  assert.deepEqual(sortMakerSections(makers, order).map((m) => m.makerId), ['a', 'm', 'z']) // 再実行しても同じ
})
test('sortMakerSections: 候補無し(latestFetchedAt=null)のメーカーは末尾へ', () => {
  const makers = [
    { makerId: 'a', latestFetchedAt: null },
    { makerId: 'b', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
  ]
  assert.deepEqual(sortMakerSections(makers, ['a', 'b']).map((m) => m.makerId), ['b', 'a'])
})
test('sortMakerSections: makerIdOrderに存在しないmakerIdは末尾側にフォールバックする', () => {
  const makers = [
    { makerId: 'unknown', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
    { makerId: 'a', latestFetchedAt: '2026-08-17T00:00:00+00:00' },
  ]
  assert.deepEqual(sortMakerSections(makers, ['a']).map((m) => m.makerId), ['a', 'unknown'])
})

// ═════════════════════════════════════════════════════════════════════════════
// chunkArray / mergeCandidateChunks (Phase 1: 1000行cap対応・chunk化)
// ═════════════════════════════════════════════════════════════════════════════
test('chunkArray: 割り切れる場合は均等に分割される', () => {
  const arr = [1, 2, 3, 4, 5, 6]
  assert.deepEqual(chunkArray(arr, 2), [[1, 2], [3, 4], [5, 6]])
})
test('chunkArray: 割り切れない場合は最後のチャンクだけ短くなる', () => {
  const arr = [1, 2, 3, 4, 5]
  assert.deepEqual(chunkArray(arr, 2), [[1, 2], [3, 4], [5]])
})
test('chunkArray: 本番設定(57メーカー・13件/chunk)は13,13,13,13,5の5チャンクになる', () => {
  const makerIds = Array.from({ length: 57 }, (_, i) => String(i + 1))
  const chunks = chunkArray(makerIds, 13)
  assert.deepEqual(chunks.map((c) => c.length), [13, 13, 13, 13, 5])
  assert.equal(chunks.length, 5)
  // 5チャンク × 60(RPC_LIMIT_PER_MAKER) = 最大780行/chunk。1000件上限に対し余裕がある。
  assert.ok(13 * 60 < 800, 'chunk1件あたりの最大行数が800を超えないこと')
})
test('chunkArray: 全要素がいずれかのチャンクに過不足なく含まれる(欠落・重複なし)', () => {
  const arr = Array.from({ length: 57 }, (_, i) => `m${i + 1}`)
  const chunks = chunkArray(arr, 13)
  const flattened = chunks.flat()
  assert.deepEqual(flattened, arr) // 順序も含めて完全一致
  assert.equal(new Set(flattened).size, arr.length) // 重複なし
})
test('chunkArray: 空配列は空配列を返す', () => {
  assert.deepEqual(chunkArray([], 13), [])
})
test('chunkArray: size <= 0 は分割せず単一チャンクを返す(無限ループ防止)', () => {
  assert.deepEqual(chunkArray([1, 2, 3], 0), [[1, 2, 3]])
  assert.deepEqual(chunkArray([1, 2, 3], -1), [[1, 2, 3]])
  assert.deepEqual(chunkArray([], 0), [])
})
test('chunkArray: sizeが配列長以上なら単一チャンクになる', () => {
  assert.deepEqual(chunkArray([1, 2, 3], 100), [[1, 2, 3]])
})

test('mergeCandidateChunks: 全チャンク成功時はflattenして返す(順序維持)', () => {
  const result = mergeCandidateChunks([
    { ok: true, rows: [{ external_id: 'a' }, { external_id: 'b' }] },
    { ok: true, rows: [{ external_id: 'c' }] },
  ])
  assert.deepEqual(result.rows.map((r) => r.external_id), ['a', 'b', 'c'])
  assert.equal(result.allFailed, false)
  assert.equal(result.failedCount, 0)
})
test('mergeCandidateChunks: 一部チャンク失敗時はgraceful degradation(成功分だけ返す。allFailedはfalse)', () => {
  const result = mergeCandidateChunks([
    { ok: true, rows: [{ external_id: 'a' }] },
    { ok: false },
    { ok: true, rows: [{ external_id: 'c' }] },
  ])
  assert.deepEqual(result.rows.map((r) => r.external_id), ['a', 'c'])
  assert.equal(result.allFailed, false)
  assert.equal(result.failedCount, 1)
})
test('mergeCandidateChunks: 全チャンク失敗時はallFailed=trueかつrowsは空', () => {
  const result = mergeCandidateChunks([{ ok: false }, { ok: false }])
  assert.deepEqual(result.rows, [])
  assert.equal(result.allFailed, true)
  assert.equal(result.failedCount, 2)
})
test('mergeCandidateChunks: チャンク結果が空配列(chunks.length===0)ならallFailedはfalse', () => {
  const result = mergeCandidateChunks([])
  assert.deepEqual(result.rows, [])
  assert.equal(result.allFailed, false)
  assert.equal(result.failedCount, 0)
})
test('mergeCandidateChunks: external_id重複は先勝ちでdedupeされる(チャンク境界を跨いだ安全側マージ)', () => {
  const result = mergeCandidateChunks([
    { ok: true, rows: [{ external_id: 'dup', title: 'first' }] },
    { ok: true, rows: [{ external_id: 'dup', title: 'second' }, { external_id: 'unique' }] },
  ])
  assert.deepEqual(result.rows.map((r) => r.external_id), ['dup', 'unique'])
  assert.equal(result.rows[0].title, 'first') // 先勝ち
})
test('mergeCandidateChunks: 本番相当シミュレーション(57メーカー・5chunk中1chunk失敗)でも他4chunk分のメーカーは保持される', () => {
  const makerIds = Array.from({ length: 57 }, (_, i) => String(i + 1))
  const chunks = chunkArray(makerIds, 13)
  const chunkResults = chunks.map((chunk, i) =>
    i === 2
      ? { ok: false } // 3番目のchunk(13,13,[13],13,5)だけRPC失敗を模擬
      : { ok: true, rows: chunk.map((id) => ({ external_id: `ext-${id}`, maker_id: id })) },
  )
  const result = mergeCandidateChunks(chunkResults)
  assert.equal(result.allFailed, false)
  assert.equal(result.failedCount, 1)
  // 失敗した13メーカー分を除く44メーカー分の行が保持されている
  assert.equal(result.rows.length, 57 - 13)
  const survivingMakerIds = new Set(result.rows.map((r) => r.maker_id))
  const failedMakerIds = new Set(chunks[2])
  for (const id of failedMakerIds) assert.equal(survivingMakerIds.has(id), false)
})
