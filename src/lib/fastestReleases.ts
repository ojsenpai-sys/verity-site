/**
 * 最新作最速更新情報 — 自動抽出ロジック(Phase B / A案 → Phase F → Phase F-2 → Phase 1 Refresh)。
 *
 * Phase 1 Refresh（今回）: 対象を旧8メーカーの手動配列から
 * src/lib/makers.ts の MAKERS 全件（source of truth・件数はハードコードしない）へ拡張し、
 * 以下を変更した:
 *   - 取得方式: メーカーごと2クエリ×Nメーカー(N+1)から、RPC
 *     get_fastest_releases_candidates(maker_ids, limit_per_maker) 1本へ統合
 *     （057_fastest_releases_candidates_rpc.sql・window functionで全メーカー分を1クエリで取得）。
 *   - キャッシュ: メーカーごとのunstable_cacheエントリ(N個)から、全メーカー分をまとめた
 *     1エントリへ統合（TTLは60秒。理由は本ファイル末尾のコメント参照）。
 *   - 表示件数: 「最新batch(同一fetched_at)の件数 N」に応じて5〜10件の可変表示
 *     （selectFastestCardsVariable。batch<5件の場合は直前の同メーカー作品で5件まで補完）。
 *   - メーカー表示順: 「最新batchのfetched_at」降順・同一値はMAKERS配列順で安定タイブレーク
 *     （sortMakerSections）。
 *   - Homepageは動的上位8メーカー、/verity/latest は全メーカーをページネーション表示。
 *
 * 「検知」と「表示」を分離する設計はPhase F-2から維持:
 *   - 検知: メーカーごとに floor∈{videoa, dvd} を合算した MAX(fetched_at) を
 *           「最新検知batch」とし、その時刻と完全一致する行を候補にする
 *           (fetched_atはINSERT時に一度だけ確定し、以降のcronで再取得されても
 *            更新されない — maker-sync.mjsはmissing CIDのみをINSERTし、
 *            既存行へのUPDATE経路はコード上存在しない。Phase 1監査で再確認済み)。
 *   - 表示floor: batch内にvideoa行が1件以上あればvideoaのみ。0件のときのみ
 *           dvdをフォールバックとして採用する。
 *   - batch内の整理・同一作品(派生SKU)dedupeのロジックは
 *     src/lib/fastestReleasesSelection.mjs に分離済み(pure・node:testで直接テスト可能)。
 *
 * メーカー単位のフォールバック方針(旧8メーカーのみ・変更なし):
 *   - 個別メーカーの自動取得が失敗/0件 → そのメーカーだけ手動 CID 配列(FALLBACK_MAKERS)を使う
 *     (FALLBACK_MAKERSは旧8メーカー分の手動キュレーションのみ保持。新規49メーカーには
 *      手動フォールバックデータが存在しないため、自動取得が0件の場合は単純にその
 *      メーカーのセクションを表示しない — 存在しない作品を無理に補完しないという
 *      今回の方針と一致する)。
 *   - フォールバック用の記事情報(タイトル/スラッグ)取得も失敗した場合は CID 直描画へ縮退する
 *
 * 本ファイルは読み取り専用(SELECT/RPCのみ)。cron_status_runs 等への書き込みは行わない。
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl } from '@/lib/cidUtils'
import { selectFastestCardsVariable, sortMakerSections, chunkArray, mergeCandidateChunks } from '@/lib/fastestReleasesSelection.mjs'
import { MAKERS as ALL_MAKERS, type Maker } from '@/lib/makers'

export type FastestCard = {
  cid: string
  title: string
  slug: string | null
  coverUrl: string
  imgSrc: string
  href: string | null
  actressName: string
  /** 'videoa' | 'dvd' | null。dvdは通販(物販/予約)floorのフォールバック表示 — CTA文言の出し分けに使う(Phase F-2)。 */
  floor: string | null
}

export type FastestMakerSection = {
  /** maker id(文字列化)。Reactのkey・セクション識別に使う。 */
  id: string
  makerId: number
  label: string
  /** JST 'YYYY-MM-DD'。自動取得時は最新入荷日、フォールバック時は手動 updatedAt の日付部分。 */
  updateDateKey: string
  source: 'auto' | 'fallback'
  cards: FastestCard[]
  /** 「もっと見る」内部リンク先(既存 /verity/makers/[makerId]) */
  moreUrl: string
}

// Homepageに表示する「直近更新上位メーカー数」。全対象メーカー数(MAKERS.length)を
// 表示するとページが際限なく伸びるため、上位のみを表示し残りは /verity/latest に委ねる。
const HOMEPAGE_MAKER_COUNT = 8

// /verity/latest の1ページあたりメーカー数(server-side pagination)。
const LATEST_PAGE_MAKER_COUNT = 12

// トップページ/latest共通のメーカーごと最大表示件数。
const MAX_CARDS_PER_MAKER = 10
const MIN_CARDS_PER_MAKER = 5

// RPCが1メーカーあたり取得する候補行数(fetched_at降順の上位N件)。
// Phase 1実装当初は40を採用したが、production read-only validationで
// 「batchが1件しかなく、かつ同時期の他floor行がpoolを占有してしまい、
//  limit=40では補完候補プールが0件になり5件未満表示になる」ケースを発見
// (例: maker 3152/S1 — limit=40でfinal=1件)。
// limit=40/60/80/100の4水準を本番データで比較した結果:
//   - limit=60でmaker 3152のケースは解消(pool_available=15→表示5件達成)
//   - 「limit=40時点で5件未満だった41メーカー」のうちlimit=60は38/41を
//     5件表示まで回復させる。これはlimit=80/100と完全に同一の回復数であり、
//     80/100へ引き上げても追加の回復効果はゼロ(残り3メーカーは母数不足による
//     genuine低在庫・floor偏りで、5件未満表示が仕様どおりの許容ケース)。
// → 60を採用する(80/100は無意味に行数を増やすだけでベネフィットが無い)。
const RPC_LIMIT_PER_MAKER = 60

// PostgREST/Supabaseはレスポンスを既定で最大1000行に切り詰める(超過分は
// エラーにならず黙って欠落する)。57メーカー全件を1リクエストで
// p_limit_per_maker=60 で取得すると理論上最大 57*60=3420行になり得るため、
// production read-only validationで実際に約32/57メーカー分が無言で欠落する
// ことを確認した(BLOCKER)。
// 対策: メーカーID配列を複数チャンクへ分割し、チャンクごとに個別RPC呼び出しを
// 行い、結果をマージする(DB/RPC/migration側は一切変更しない — 057/058は
// 本番適用済みのため変更禁止。アプリ側のみで解決する)。
// チャンクサイズの決め方: 1000件ちょうどを狙わず余裕を持たせる方針
// (最大800 rows/chunk程度を目安)から、
//   MAKERS_PER_CHUNK * RPC_LIMIT_PER_MAKER <= 800 を満たす最大値として
//   13 * 60 = 780 (1000件上限に対し約22%の余裕)を採用。
// 57メーカーを13件ずつに分けると ceil(57/13)=5 チャンク(13,13,13,13,5)。
const MAKERS_PER_CHUNK = 13

// ── 手動フォールバック配列(元 FastestNewReleases.tsx から移設。削除しない) ──────────────
// 旧8メーカー分のみ。新規49メーカーには手動データが存在しないため対象外。
type FallbackMakerConfig = {
  id: 's1' | 'ideapocket' | 'moodyz' | 'kawaii' | 'honchu' | 'premium' | 'ebody' | 'oppai'
  updatedAt: string
  cids: readonly string[]
  actressMap: Record<string, string>
}

// フォールバックキー(旧FastestMakerKey相当) ⇔ 実際のmaker id の対応表。
// FALLBACK_MAKERSのデータ自体(cids/actressMap)は変更しない。
const LEGACY_FALLBACK_MAKER_IDS: Record<FallbackMakerConfig['id'], number> = {
  moodyz: 1509, honchu: 6304, premium: 3890, ebody: 5032,
  oppai: 5238, s1: 3152, ideapocket: 1219, kawaii: 4469,
}

export const FALLBACK_MAKERS: FallbackMakerConfig[] = [
  {
    id: 'moodyz',
    updatedAt: '2026-07-21T10:32:57+09:00',
    cids: [
      'mida00681', 'mida00703', 'mida00741', 'mida00742', 'mida00743',
      'mida00746', 'mida00747', 'mida00748', 'mida00752', 'mida00753',
      'mida00750', 'mida00755', 'mida00749', 'mikr00117', 'mikr00119',
      'mifd00732', 'mida00792',
    ],
    actressMap: {
      mida00681: '三咲まゆ',
      mida00703: '七沢みあ',
      mida00741: '葉山みりあ',
      mida00742: 'Himari',
      mida00743: '奥井千晴',
      mida00746: '宮下玲奈',
      mida00747: '石原希望',
      mida00748: '泉ももか',
      mida00752: 'うんぱい',
      mida00753: '来栖唯希・日向由奈',
      mida00750: '恋川こもも',
      mida00755: '篠真有',
      mida00749: '九野ひなの',
      mikr00117: '白川美玲',
      mikr00119: '白岩冬萌',
      mifd00732: '大野瑞季',
      mida00792: '北乃衣織',
    },
  },
  {
    id: 'honchu',
    updatedAt: '2026-07-28T00:15:00+09:00',
    cids: [
      'hmn00886', 'hmn00884', 'hmn00898', 'hmn00897', 'hmn00893',
      'hmn00899', 'hmn00895', 'hmn00900', 'hndb00282', 'hmn00896',
    ],
    actressMap: {
      hmn00886: '彩月七緒・羽月乃蒼',
      hmn00884: '東條なつ',
      hmn00898: '香水じゅん',
      hmn00897: 'ひなたなつ',
      hmn00893: '倉本すみれ',
      hmn00899: '鈴の家りん',
      hmn00895: '朝比奈紗良',
      hmn00900: '竹内有紀',
      hndb00282: '東條なつ',
      hmn00896: '五日市芽依',
    },
  },
  {
    id: 'premium',
    updatedAt: '2026-07-21T10:32:57+09:00',
    cids: [
      'pred00884', 'pbd00523', 'pred00889', 'pred00891', 'pred00887',
      'pred00892', 'pred00882', 'prwf00015', 'pred00871', 'pred00888',
      'pbd00524', 'prwf00013',
    ],
    actressMap: {
      pred00884: '波多野結衣',
      pbd00523: '楪カレン 他',
      pred00889: '三好佑香',
      pred00891: '田村香奈',
      pred00887: '逢沢みゆ',
      pred00892: '和香なつき',
      pred00882: '楪カレン',
      prwf00015: '小松空',
      pred00871: '幸村泉希',
      pred00888: '根尾あかり',
      pbd00524: '三好佑香 他',
      prwf00013: '二階堂美雨',
    },
  },
  {
    id: 'ebody',
    updatedAt: '2026-07-21T10:32:57+09:00',
    cids: [
      'ebwh00356', 'ebwh00354', 'ebwh00343', 'ebwh00350', 'eyan00228',
      'mkck00427', 'mkck00428', 'ebwh00353',
    ],
    actressMap: {
      ebwh00356: '柏木ふみか',
      ebwh00354: '東峯日奈子',
      ebwh00343: '清宮仁愛',
      ebwh00350: '大門レヤ',
      eyan00228: '朝羽穂乃',
      mkck00427: '佐山由依 他',
      mkck00428: '柏木ふみか 他',
      ebwh00353: '小花のん・莉々はるか',
    },
  },
  {
    id: 'oppai',
    updatedAt: '2026-07-21T10:32:57+09:00',
    cids: [
      'ppbd00322', 'pppe00444', 'pppe00436', 'pppe00438', 'pppe00437',
      'pppe00435', 'pppe00434', 'pppe00433',
    ],
    actressMap: {
      ppbd00322: '楪カレン 他',
      pppe00444: 'RINOA',
      pppe00436: '三木環奈',
      pppe00438: 'あんづ杏',
      pppe00437: '中山ふみか',
      pppe00435: '彩月七緒',
      pppe00434: '役野満里奈',
      pppe00433: '楪カレン',
    },
  },
  {
    id: 's1',
    updatedAt: '2026-07-28T00:30:00+09:00',
    cids: [
      'snos00333', 'snos00360', 'snos00365', 'snos00362', 'snos00356',
      'snos00369', 'snos00335', 'snos00345', 'snos00409', 'snos00373',
      'snos00346', 'snos00290', 'snos00311', 'snos00315', 'snos00317',
      'snos00371', 'snos00340', 'snos00145',
      'ofje00649', 'ofje00655', 'ofje00654',
      'snos00361', 'snos00357', 'snos00353', 'snos00334', 'snos00332',
      'snos00323', 'snos00321', 'snos00309', 'snos00306', 'snos00298',
      'snos00297', 'snos00270', 'snos00246', 'snos00065',
      'ofje00652', 'ofje00651', 'ofje00650',
    ],
    actressMap: {
      snos00333: '渚あいり',
      snos00360: '浅野こころ',
      snos00365: '白上咲花',
      snos00362: '夏生なつ',
      snos00356: '兒玉七海',
      snos00369: '七ツ森りり',
      snos00335: '木村愛心',
      snos00345: '鷲尾めい',
      snos00409: '星空ねる',
      snos00373: '早坂奏音',
      snos00346: '初美なのか',
      snos00290: '白石透羽',
      snos00311: '渡部ほの',
      snos00315: '白花にあ',
      snos00317: '蜜このは',
      snos00371: '河北彩花',
      snos00340: '新木希空',
      snos00145: '倉木華',
      ofje00649: '桜乃りの',
      ofje00655: '紫堂るい 他',
      ofje00654: '雛形みくる 他',
      snos00361: '楓ふうあ',
      snos00357: '川越にこ',
      snos00353: '村上悠華・miru',
      snos00334: '瀬戸環奈',
      snos00332: '奥田咲・桜乃りの',
      snos00323: '三田真鈴',
      snos00321: '紫堂るい',
      snos00309: '金松季歩',
      snos00306: '安達夕莉',
      snos00298: '園梨音',
      snos00297: '雛形みくる',
      snos00270: '博多彩葉',
      snos00246: '鈴木希',
      snos00065: '田野憂',
      ofje00650: '木村愛心',
    },
  },
  {
    id: 'ideapocket',
    updatedAt: '2026-07-14T11:13:05+09:00',
    cids: [
      'ipzz00958', 'ipzz00946', 'ipzz00940', 'ipzz00932', 'ipzz00931',
      'ipzz00929', 'ipzz00926', 'ipzz00925', 'ipzz00922', 'ipzz00919',
      'ipzz00918', 'ipzz00915', 'ipzz00914', 'ipzz00913', 'ipzz00910',
      'ipzz00904', 'ipzz00901', 'ipzz00899', 'ipzz00892', 'ipzz00890',
      'ipzz00877', 'ipzz00871',
      'ipok00030', 'ipok00028', 'ipok00027',
    ],
    actressMap: {
      ipzz00958: 'ひなの花音',
      ipzz00946: '永野紬',
      ipzz00940: '仲村みう',
      ipzz00932: '楓カレン',
      ipzz00931: '西田瑞希',
      ipzz00929: '美琴千緒',
      ipzz00926: '佐々木さき',
      ipzz00925: '瀬緒凛',
      ipzz00922: '林芽依',
      ipzz00919: '白石るな',
      ipzz00918: '愛才りあ',
      ipzz00915: '花咲澪',
      ipzz00914: '堀北桃愛',
      ipzz00913: '辻みいな',
      ipzz00910: '藤咲まい',
      ipzz00904: '山田鈴奈',
      ipzz00901: '三澄寧々',
      ipzz00899: '篠崎沙帆',
      ipzz00892: '西宮ゆめ',
      ipzz00890: 'さくらわかな',
      ipzz00877: '長浜みつり',
      ipzz00871: '桜空もも',
    },
  },
  {
    id: 'kawaii',
    updatedAt: '2026-07-07T20:14:58+09:00',
    cids: [
      'cawb00023', 'cawb00018', 'cawb00022', 'cawb00026', 'cawb00012',
      'cawd00999', 'cawd00989', 'cawb00025', 'cawb00021', 'cawb00017',
      'cawb00016', 'cawb00015',
    ],
    actressMap: {
      cawb00023: '世良しずく',
      cawb00018: '花咲ゆら',
      cawb00022: '白月さとみ',
      cawb00026: '新垣める',
      cawb00012: '清野咲',
      cawd00999: '逢沢みゆ',
      cawd00989: '伊藤舞雪',
      cawb00025: '浅海なみ',
      cawb00021: '宍戸里帆',
      cawb00017: '本間あさ美',
      cawb00016: '結城りの',
      cawb00015: '齋藤かさね',
    },
  },
]

// ── DB行の最小shape(RPC返却カラムに対応) ────────────────────────────────────────
type CandidateRow = {
  maker_id: string
  external_id: string
  title: string | null
  slug: string | null
  image_url: string | null
  metadata: Record<string, unknown> | null
  published_at: string | null
  fetched_at: string
}

// ── Supabase クライアント(cookie非依存・unstable_cache内で使用可能) ──────────────────
// createClient('@/lib/supabase/server') は cookies() に依存するため unstable_cache 内で使えない。
// 本機能は匿名公開データの読み取りのみなので、cookie/セッション状態を持たない専用クライアントを使う。
let _client: SupabaseClient | null = null
function getStatelessClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const timedFetch = withFetchTimeout(fetch, SUPABASE_FETCH_TIMEOUT_MS)
  _client = createSupabaseClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init = {}) => timedFetch(input, { ...init, cache: 'no-store' }) },
  })
  return _client
}

function toJstDateKey(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/**
 * 全対象メーカー分の候補行を取得する(Phase 1: N+1解消 → 1000行cap対応でchunk化)。
 * 057_fastest_releases_candidates_rpc.sql の get_fastest_releases_candidates を
 * メーカーIDをチャンク分割して複数回呼び出し、結果をマージする。
 *
 * 障害時の方針(graceful degradation採用): チャンク単位でPromise.allSettledを使い、
 * 一部チャンクのRPC呼び出しが失敗しても他チャンクの結果は破棄しない
 * (全チャンクが失敗した場合のみ例外を投げ、呼び出し元の既存catch節に委ねる)。
 * 理由: chunk化により1回のfetchで発行するRPC呼び出し数が1→5に増えるため、
 * 「1回でも失敗したら全体を失敗扱いにする」(fail-closed)を採用すると、
 * 単一チャンクの一時的な不調だけで57メーカー全体が表示不可になり、
 * chunk化前(RPC1本)より信頼性が悪化してしまう。本キャッシュのTTLは60秒と
 * 短く次回revalidateで自然に回復するため、「失敗したチャンク分のメーカーだけ
 * 今回は表示されない」方が「57メーカー全部が今回表示されない」より実害が
 * 小さいと判断した。失敗したチャンクはconsole.errorで記録する。
 */
async function fetchAllCandidatesRaw(): Promise<CandidateRow[]> {
  const supabase = getStatelessClient()
  const makerIds = ALL_MAKERS.map((m) => String(m.id))
  const chunks = chunkArray(makerIds, MAKERS_PER_CHUNK) as string[][]

  const settled = await Promise.allSettled(
    chunks.map((chunk) =>
      supabase.rpc('get_fastest_releases_candidates', {
        p_maker_ids: chunk,
        p_limit_per_maker: RPC_LIMIT_PER_MAKER,
      }),
    ),
  )

  const chunkResults = settled.map((result) => {
    if (result.status === 'rejected') {
      console.error('[FastestNewReleases] get_fastest_releases_candidates chunk rejected:', result.reason)
      return { ok: false as const }
    }
    const { data, error } = result.value
    if (error) {
      console.error('[FastestNewReleases] get_fastest_releases_candidates chunk error:', error.message)
      return { ok: false as const }
    }
    return { ok: true as const, rows: (data ?? []) as CandidateRow[] }
  })

  const { rows, allFailed } = mergeCandidateChunks(chunkResults) as {
    rows: CandidateRow[]
    allFailed: boolean
    failedCount: number
  }
  if (allFailed) throw new Error('get_fastest_releases_candidates: all chunks failed')
  return rows
}

// Phase 1: 全メーカー分を1エントリにまとめてキャッシュする(旧: メーカーごとにN個)。
// TTL=60秒とした理由(旧300秒から短縮):
//   - 旧実装はメーカーごとに個別キャッシュ・個別クエリだったため、TTLを短くすると
//     キャッシュミス時に最大114クエリが再発生するリスクがあった。
//   - Phase 1でRPC1本化・キャッシュ1エントリ化した結果、キャッシュミス時のコストは
//     「57メーカー分をカバーする1クエリ」のみになった。ミス時コストが約1/50に
//     下がったため、同じ安全性を保ったままTTLを短縮できる。
//   - maker-syncは1日1回(00:30 JST)のみ実行されるため、理論上は数分でも十分だが、
//     「最速反映」の体感を優先しつつ、force-dynamicなHomepageで毎リクエストDBを
//     叩く事態を避けるため、まずは60秒という保守的な値を採用する
//     (maker-sync直接revalidate等の大規模変更は今回のスコープ外)。
const getCachedCandidates = unstable_cache(fetchAllCandidatesRaw, ['fastest-releases-all-candidates'], {
  revalidate: 60,
})

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}
function proxied(url: string): string {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}
function effectiveCoverUrl(cid: string, imageUrl: string | null | undefined): string {
  const raw = imageUrl && !isBadImageUrl(imageUrl) ? imageUrl : null
  return toHighResPackageUrl(raw) ?? cidToCdnUrl(cid, 'pl')
}
function rowAffiliateUrl(row: Pick<CandidateRow, 'metadata'>): string | null {
  const meta = row.metadata as Record<string, unknown> | null
  const raw =
    typeof meta?.affiliate_url === 'string' ? meta.affiliate_url
    : typeof meta?.url === 'string' ? meta.url
    : null
  return withAffiliate(raw)
}
function rowHasUrl(row: Pick<CandidateRow, 'metadata'>): boolean {
  const meta = row.metadata as Record<string, unknown> | null
  const url = typeof meta?.url === 'string' ? meta.url : null
  // Phase F-2: dvd floor(通販)を検知フォールバックとして正式に許可するため、
  // 旧 /mono/dvd/ 除外は撤廃(URLが存在することのみ確認する)。floorの採否は
  // selectFastestCardsVariable() 側(pickDisplayFloor)が担う。
  return !!url
}
function rowFloor(row: Pick<CandidateRow, 'metadata'>): string | null {
  const meta = row.metadata as Record<string, unknown> | null
  return typeof meta?.floor === 'string' ? meta.floor : null
}
function formatActressName(actress: unknown): string {
  const list = Array.isArray(actress)
    ? (actress as { name?: unknown }[]).filter((a) => typeof a?.name === 'string').map((a) => a.name as string)
    : []
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return list.join('・')
  return `${list[0]} 他`
}

function rowToCard(row: CandidateRow): FastestCard {
  const cover = effectiveCoverUrl(row.external_id, row.image_url)
  return {
    cid: row.external_id,
    title: row.title ?? '',
    slug: row.slug ?? null,
    coverUrl: cover,
    imgSrc: proxied(cover),
    href: rowAffiliateUrl(row) ?? withAffiliate(dmmUrl(row.external_id)),
    actressName: formatActressName((row.metadata as Record<string, unknown> | null)?.actress),
    floor: rowFloor(row),
  }
}

function moreUrl(makerId: number): string {
  return `/verity/makers/${makerId}`
}

function buildFallbackSection(maker: Maker): FastestMakerSection | null {
  const legacyKey = (Object.keys(LEGACY_FALLBACK_MAKER_IDS) as FallbackMakerConfig['id'][]).find(
    (k) => LEGACY_FALLBACK_MAKER_IDS[k] === maker.id,
  )
  if (!legacyKey) return null // 新規メーカーには手動フォールバックが無い→セクション自体を出さない
  const manual = FALLBACK_MAKERS.find((m) => m.id === legacyKey)
  if (!manual) return null
  const cards: FastestCard[] = manual.cids.slice(0, MAX_CARDS_PER_MAKER).map((cid) => ({
    cid,
    title: '',
    slug: null,
    coverUrl: cidToCdnUrl(cid, 'pl'),
    imgSrc: proxied(cidToCdnUrl(cid, 'pl')),
    href: withAffiliate(dmmUrl(cid)),
    actressName: manual.actressMap[cid] ?? '',
    floor: 'videoa', // FALLBACK_MAKERSは旧手動キュレーション由来ですべてvideoa作品(既知)
  }))
  return {
    id: String(maker.id),
    makerId: maker.id,
    label: maker.name,
    updateDateKey: manual.updatedAt.slice(0, 10),
    source: 'fallback',
    cards,
    moreUrl: moreUrl(maker.id),
  }
}

/**
 * フォールバックセクションのカードに、可能な範囲でDB記事情報(タイトル/スラッグ/画像)を
 * 補完する。失敗してもCID直描画のまま(既存の縮退動作)。
 */
async function enrichFallbackSections(sections: FastestMakerSection[]): Promise<FastestMakerSection[]> {
  const fallbackSections = sections.filter((s) => s.source === 'fallback')
  if (fallbackSections.length === 0) return sections
  try {
    const cids = fallbackSections.flatMap((s) => s.cards.map((c) => c.cid))
    const supabase = getStatelessClient()
    const { data, error } = await supabase
      .from('articles')
      .select('external_id,title,slug,image_url,metadata')
      .eq('is_active', true)
      .in('external_id', cids)
    if (error) throw new Error(error.message)
    const articleMap = new Map(
      (data ?? []).map((r) => [(r as { external_id: string }).external_id, r as Omit<CandidateRow, 'maker_id' | 'published_at' | 'fetched_at'>]),
    )
    return sections.map((s) => {
      if (s.source !== 'fallback') return s
      return {
        ...s,
        cards: s.cards.map((c) => {
          const row = articleMap.get(c.cid)
          if (!row) return c
          const cover = effectiveCoverUrl(c.cid, row.image_url)
          return {
            ...c,
            title: row.title ?? c.title,
            slug: row.slug ?? c.slug,
            coverUrl: cover,
            imgSrc: proxied(cover),
            href: rowAffiliateUrl(row) ?? c.href,
            floor: rowFloor(row) ?? c.floor,
          }
        }),
      }
    })
  } catch (err) {
    console.warn(
      '[FastestNewReleases] fallback article enrichment failed — rendering CID-only cards:',
      err instanceof Error ? err.message : err,
    )
    return sections // 失敗時は元のCID直描画のまま(既存の縮退動作)
  }
}

/**
 * 全対象メーカー(src/lib/makers.ts の MAKERS 全件)の「最新作最速更新情報」セクションを
 * 構築する(cards付き・表示順ソート済み)。Homepage/latest ページ双方から呼ばれ、
 * 呼び出し側でスライスして使う(RPC/キャッシュは1回で共有される)。
 */
export async function getFastestReleasesSections(): Promise<FastestMakerSection[]> {
  let rows: CandidateRow[] = []
  try {
    rows = await getCachedCandidates()
  } catch (err) {
    console.error('[FastestNewReleases] get_fastest_releases_candidates failed:', err instanceof Error ? err.message : err)
  }

  const byMaker = new Map<number, CandidateRow[]>()
  for (const r of rows) {
    const mid = Number(r.maker_id)
    if (!Number.isFinite(mid)) continue
    const list = byMaker.get(mid)
    if (list) list.push(r)
    else byMaker.set(mid, [r])
  }

  const nowIso = new Date().toISOString()
  const sections: FastestMakerSection[] = []
  const latestFetchedAtByMaker: { makerId: string; latestFetchedAt: string | null }[] = []

  for (const maker of ALL_MAKERS) {
    const makerRows = byMaker.get(maker.id) ?? []
    const candidates = makerRows
      .filter((r) => rowHasUrl(r) && !!r.external_id && !!r.title)
      .map((r) => ({ ...r, floor: rowFloor(r) }))
    const selected = candidates.length
      ? (selectFastestCardsVariable(candidates, nowIso, { min: MIN_CARDS_PER_MAKER, max: MAX_CARDS_PER_MAKER }) as CandidateRow[])
      : []

    if (selected.length > 0) {
      sections.push({
        id: String(maker.id),
        makerId: maker.id,
        label: maker.name,
        updateDateKey: toJstDateKey(selected[0].fetched_at),
        source: 'auto',
        cards: selected.map(rowToCard),
        moreUrl: moreUrl(maker.id),
      })
      latestFetchedAtByMaker.push({ makerId: String(maker.id), latestFetchedAt: selected[0].fetched_at })
      continue
    }

    const fallback = buildFallbackSection(maker)
    if (fallback) {
      sections.push(fallback)
      latestFetchedAtByMaker.push({ makerId: String(maker.id), latestFetchedAt: null })
    }
    // フォールバックも無ければ、このメーカーはセクション自体を出さない(無理な補完をしない)。
  }

  const enriched = await enrichFallbackSections(sections)
  const bySortKey = new Map(latestFetchedAtByMaker.map((m) => [m.makerId, m.latestFetchedAt]))
  const orderedMakerIds = ALL_MAKERS.map((m) => String(m.id))

  const sortable = enriched.map((s) => ({ makerId: s.id, latestFetchedAt: bySortKey.get(s.id) ?? null }))
  const ordered = sortMakerSections(sortable, orderedMakerIds) as { makerId: string }[]
  const order: string[] = ordered.map((s) => s.makerId)
  const indexOf = new Map<string, number>(order.map((id, i) => [id, i]))
  return [...enriched].sort((a, b) => (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0))
}

/** Homepage向け: 直近更新順の上位N社のみ(N=HOMEPAGE_MAKER_COUNT)。 */
export async function getHomepageFastestReleasesSections(): Promise<FastestMakerSection[]> {
  const all = await getFastestReleasesSections()
  return all.slice(0, HOMEPAGE_MAKER_COUNT)
}

export type FastestReleasesPage = {
  sections: FastestMakerSection[]
  page: number
  totalPages: number
  totalMakers: number
}

/**
 * /verity/latest 向け: 全メーカーをserver-side paginationで返す(page=1始まり)。
 * 570作品の一括renderを避けるため、1ページあたり LATEST_PAGE_MAKER_COUNT 社のみ。
 */
export async function getFastestReleasesPage(page: number): Promise<FastestReleasesPage> {
  const all = await getFastestReleasesSections()
  const totalMakers = all.length
  const totalPages = Math.max(1, Math.ceil(totalMakers / LATEST_PAGE_MAKER_COUNT))
  const clampedPage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages)
  const from = (clampedPage - 1) * LATEST_PAGE_MAKER_COUNT
  return {
    sections: all.slice(from, from + LATEST_PAGE_MAKER_COUNT),
    page: clampedPage,
    totalPages,
    totalMakers,
  }
}
