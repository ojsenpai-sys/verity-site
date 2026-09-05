/**
 * 最新作最速更新情報 — 自動抽出ロジック(Phase B / A案 → Phase F → Phase F-2)。
 *
 * Phase F-2: 「検知」と「表示」を分離する設計。
 *   - 検知: メーカーごとに floor∈{videoa, dvd} を合算した MAX(fetched_at) を
 *           「最新検知batch」とし、その時刻と完全一致する行を候補にする
 *           (fetched_atはINSERT時に一度だけ確定し、以降のcronで再取得されても
 *            更新されない — 同一トランザクションで挿入された行はfetched_atが
 *            完全一致する)。
 *   - 表示floor: batch内にvideoa行が1件以上あればvideoaのみ。0件のときのみ
 *           dvdをフォールバックとして採用する。videoa/dvdの同一作品をCID変換で
 *           マージすることはしない(DMM側に信頼できる同一作品キーが存在しないため)。
 *           後日videoa版がDBへ入れば、その時点のMAX(fetched_at)が新しいbatchに
 *           なり自然にvideoaへ切り替わる。
 *   - batch内の整理: published_at はフィルタではなく整理に使う。
 *           1. published_at >= now(未来) → published_at 昇順(現在に近い順)
 *           2. 1だけで件数が足りない場合、published_at < now(配信済み) →
 *              published_at 降順(新しい順)で補完
 *           3. published_at が null の行は除外
 *   選定ロジック本体は src/lib/fastestReleasesSelection.mjs (pure・node:testで直接テスト可能)。
 *
 * メーカー間表示順(2026-08-04 オーナー指示 → Phase F-2で検知基準に統一):
 *   各メーカーの MAX(fetched_at)(JST日付)降順。同日は下記 TARGET_MAKERS の
 *   配列順(既存 MAKERS 基本順を踏襲)で安定表示する。
 *
 * メーカー単位のフォールバック方針:
 *   - 個別メーカーの自動取得が失敗/0件 → そのメーカーだけ手動 CID 配列(FALLBACK_MAKERS)を使う
 *   - 全メーカー失敗しても同じ経路で自然に「全メーカー手動表示」へ縮退する(特別分岐は作らない)
 *   - フォールバック用の記事情報(タイトル/スラッグ)取得も失敗した場合は CID 直描画へ縮退する
 *     (元の FastestNewReleases.tsx が既に持っていた「DB記事が無ければCIDから直接カード化」と同じ設計)
 *
 * 本ファイルは読み取り専用(SELECT のみ)。cron_status_runs 等への書き込みは行わない。
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl } from '@/lib/cidUtils'
import { selectFastestCards } from '@/lib/fastestReleasesSelection.mjs'

export type FastestMakerKey =
  | 's1' | 'ideapocket' | 'moodyz' | 'kawaii' | 'honchu' | 'premium' | 'ebody' | 'oppai'

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
  id: FastestMakerKey
  label: string
  /** JST 'YYYY-MM-DD'。自動取得時は最新入荷日、フォールバック時は手動 updatedAt の日付部分。 */
  updateDateKey: string
  source: 'auto' | 'fallback'
  cards: FastestCard[]
  /** 「もっと見る」内部リンク先(既存 /verity/makers/[makerId]) */
  moreUrl: string
}

type TargetMaker = { id: number; key: FastestMakerKey; label: string }

// scripts/maker-sync.mjs の MAKERS と同一 maker_id。
// 配列順は旧 FastestNewReleases.tsx の手動 MAKERS 定義順(moodyz→honchu→premium→ebody→oppai→
// s1→ideapocket→kawaii)をそのまま踏襲する — 同日タイブレークに使う「基本配列順」はこの順序を指す。
// 追加・削除は行わない(オーナー指定)。
const TARGET_MAKERS: TargetMaker[] = [
  { id: 1509, key: 'moodyz',     label: 'ムーディーズ' },
  { id: 6304, key: 'honchu',     label: '本中' },
  { id: 3890, key: 'premium',    label: 'プレミアム' },
  { id: 5032, key: 'ebody',      label: 'E-BODY' },
  { id: 5238, key: 'oppai',      label: 'OPPAI' },
  { id: 3152, key: 's1',         label: 'エスワン' },
  { id: 1219, key: 'ideapocket', label: 'アイデアポケット' },
  { id: 4469, key: 'kawaii',     label: 'kawaii' },
]

// トップページ初期表示のメーカーごと件数(2026-08-04 性能最適化・オーナー指定)。
// 「最新入荷日と同じ日付」への絞り込みは行わない(fetched_at降順で直近N件をそのまま採用)。
// 残りは /verity/makers/[makerId](既存の全件一覧ページ)への「もっと見る」導線に委ねる。
// サーバー側の取得件数自体をこの値に絞る(Client Componentへ全件渡してCSSで隠す方式は禁止)。
const TOP_PAGE_CARDS_PER_MAKER = 10

// ── 手動フォールバック配列(元 FastestNewReleases.tsx から移設。削除しない) ──────────────
type FallbackMakerConfig = {
  id: FastestMakerKey
  updatedAt: string
  cids: readonly string[]
  actressMap: Record<string, string>
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

// ── DB行の最小shape(必要カラムのみ) ────────────────────────────────────────────
type ArticleRow = {
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

const SELECT_COLUMNS = 'external_id,title,slug,image_url,metadata,published_at,fetched_at'

function toJstDateKey(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

type MakerBatch = { latestFetchedAt: string | null; rows: ArticleRow[] }

// 「表示floor決定」「batch内整理」の正本ロジックは
// src/lib/fastestReleasesSelection.mjs に分離済み(pure・node:testで直接テスト可能)。
// ここでは「検知」— videoa+dvd合算のMAX(fetched_at)と完全一致する行(最新検知batch)の
// 取得のみを行う(2クエリ: 1.最新fetched_atを特定 → 2.その値と完全一致する行を取得)。
async function fetchMakerRowsRaw(makerId: number): Promise<MakerBatch> {
  const supabase = getStatelessClient()

  const { data: maxRows, error: maxError } = await supabase
    .from('articles')
    .select('fetched_at')
    .eq('is_active', true)
    .in('metadata->>floor', ['videoa', 'dvd'])
    .contains('metadata', { maker: [{ id: makerId }] })
    .order('fetched_at', { ascending: false })
    .limit(1)
  if (maxError) throw new Error(`maker=${makerId} max fetched_at select error: ${maxError.message}`)
  const latestFetchedAt = (maxRows?.[0] as { fetched_at: string } | undefined)?.fetched_at ?? null
  if (!latestFetchedAt) return { latestFetchedAt: null, rows: [] }

  const { data, error } = await supabase
    .from('articles')
    .select(SELECT_COLUMNS)
    .eq('is_active', true)
    .in('metadata->>floor', ['videoa', 'dvd'])
    .contains('metadata', { maker: [{ id: makerId }] })
    .eq('fetched_at', latestFetchedAt)
  if (error) throw new Error(`maker=${makerId} batch select error: ${error.message}`)
  return { latestFetchedAt, rows: (data ?? []) as ArticleRow[] }
}

// maker-sync は 00:30 JST 起動・完了まで概ね2分未満(Phase A調査結果)。
// revalidate=300s なら最悪でも 00:30 起動から5分以内(00:35まで)にトップページへ反映される。
const getCachedMakerRows = unstable_cache(
  (makerId: number) => fetchMakerRowsRaw(makerId),
  ['fastest-releases-maker-batch'],
  { revalidate: 300 },
)

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
function rowAffiliateUrl(row: Pick<ArticleRow, 'metadata'>): string | null {
  const meta = row.metadata as Record<string, unknown> | null
  const raw =
    typeof meta?.affiliate_url === 'string' ? meta.affiliate_url
    : typeof meta?.url === 'string' ? meta.url
    : null
  return withAffiliate(raw)
}
function rowHasUrl(row: Pick<ArticleRow, 'metadata'>): boolean {
  const meta = row.metadata as Record<string, unknown> | null
  const url = typeof meta?.url === 'string' ? meta.url : null
  // Phase F-2: dvd floor(通販)を検知フォールバックとして正式に許可するため、
  // 旧 /mono/dvd/ 除外は撤廃(URLが存在することのみ確認する)。floorの採否は
  // selectFastestCards() 側(pickDisplayFloor)が担う。
  return !!url
}
function rowFloor(row: Pick<ArticleRow, 'metadata'>): string | null {
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

function rowToCard(row: ArticleRow): FastestCard {
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

/**
 * 1メーカー分の自動抽出(Phase F-2)。
 * updateDateKey は「検知batch自体の fetched_at」(videoa+dvd合算MAX)の JST日付。
 * 表示カードは selectFastestCards() が floor決定(videoa優先・dvdフォールバック)と
 * published_at整理(現在に近い未来優先→配信済み新しい順で補完)を行った結果。
 *
 * 戻り値 null = 自動取得結果が0件(=呼び出し側でフォールバックへ切り替える)。
 * 例外を投げた場合も呼び出し側でフォールバックへ切り替える(Supabaseエラー・タイムアウト等)。
 */
// 「もっと見る」内部リンク先。既存 /verity/makers/[makerId](maker_idベースの全件一覧・ページネーション済み)を再利用する。
function moreUrl(maker: TargetMaker): string {
  return `/verity/makers/${maker.id}`
}

async function getAutoMakerSection(maker: TargetMaker): Promise<FastestMakerSection | null> {
  const { latestFetchedAt, rows } = await getCachedMakerRows(maker.id)
  if (!latestFetchedAt) return null

  const candidates = rows
    .filter((r) => rowHasUrl(r) && !!r.external_id && !!r.title)
    .map((r) => ({ ...r, floor: rowFloor(r) }))
  const nowIso = new Date().toISOString()
  const selected = selectFastestCards(candidates, nowIso, TOP_PAGE_CARDS_PER_MAKER) as ArticleRow[]
  if (selected.length === 0) return null

  return {
    id: maker.key,
    label: maker.label,
    updateDateKey: toJstDateKey(latestFetchedAt),
    source: 'auto',
    cards: selected.map(rowToCard),
    moreUrl: moreUrl(maker),
  }
}

function buildFallbackSection(
  maker: TargetMaker,
  articleMap: Map<string, ArticleRow> | null,
): FastestMakerSection {
  const manual = FALLBACK_MAKERS.find((m) => m.id === maker.key)
  if (!manual) {
    return { id: maker.key, label: maker.label, updateDateKey: '0000-00-00', source: 'fallback', cards: [], moreUrl: moreUrl(maker) }
  }
  // フォールバック時もトップページ表示は TOP_PAGE_CARDS_PER_MAKER 件まで(手動配列自体は全件保持)。
  const cards: FastestCard[] = manual.cids.slice(0, TOP_PAGE_CARDS_PER_MAKER).map((cid) => {
    const row = articleMap?.get(cid) ?? null
    const cover = effectiveCoverUrl(cid, row?.image_url ?? null)
    return {
      cid,
      title: row?.title ?? '',
      slug: row?.slug ?? null,
      coverUrl: cover,
      imgSrc: proxied(cover),
      href: (row ? rowAffiliateUrl(row) : null) ?? withAffiliate(dmmUrl(cid)),
      actressName: manual.actressMap[cid] ?? '',
      // FALLBACK_MAKERS は旧手動キュレーション由来ですべてvideoa作品(既知)。
      floor: row ? rowFloor(row) : 'videoa',
    }
  })
  return {
    id: maker.key,
    label: maker.label,
    updateDateKey: manual.updatedAt.slice(0, 10),
    source: 'fallback',
    cards,
    moreUrl: moreUrl(maker),
  }
}

/**
 * 対象8メーカーの「最新作最速更新情報」セクションを構築する。
 * - 自動取得はメーカーごとに独立(Promise.all)。1メーカーの失敗が他メーカーへ波及しない。
 * - フォールバック発生メーカーのみ、CID→記事情報の補完クエリを1回追加実行する(失敗時はCID直描画に縮退)。
 * - 本番DBへの書き込み・cron_status_runsへの記録は行わない(SSR中の書き込み禁止)。
 */
export async function getFastestReleasesSections(): Promise<FastestMakerSection[]> {
  const initial = await Promise.all(
    TARGET_MAKERS.map(async (maker): Promise<FastestMakerSection> => {
      try {
        const auto = await getAutoMakerSection(maker)
        if (auto) return auto
        console.warn(`[FastestNewReleases] maker=${maker.key}(${maker.id}) auto batch empty — using manual fallback`)
      } catch (err) {
        console.error(
          `[FastestNewReleases] maker=${maker.key}(${maker.id}) auto fetch failed — using manual fallback:`,
          err instanceof Error ? err.message : err,
        )
      }
      return buildFallbackSection(maker, null)
    }),
  )

  const fallbackKeys = new Set(initial.filter((s) => s.source === 'fallback').map((s) => s.id))
  let sections = initial

  if (fallbackKeys.size > 0) {
    try {
      const cids = FALLBACK_MAKERS.filter((m) => fallbackKeys.has(m.id)).flatMap((m) => [...m.cids])
      const supabase = getStatelessClient()
      const { data, error } = await supabase
        .from('articles')
        .select(SELECT_COLUMNS)
        .eq('is_active', true)
        .in('external_id', cids)
      if (error) throw new Error(error.message)
      const articleMap = new Map((data ?? []).map((r) => [(r as ArticleRow).external_id, r as ArticleRow]))
      sections = initial.map((s) => {
        if (s.source !== 'fallback') return s
        const maker = TARGET_MAKERS.find((m) => m.key === s.id)
        return maker ? buildFallbackSection(maker, articleMap) : s
      })
    } catch (err) {
      console.warn(
        '[FastestNewReleases] fallback article enrichment failed — rendering CID-only cards:',
        err instanceof Error ? err.message : err,
      )
      // sections は initial(記事情報なしのCID直描画)のまま — 既存の縮退動作と同じ。
    }
  }

  return sections
    .filter((s) => s.cards.length > 0)
    .sort((a, b) => {
      if (a.updateDateKey !== b.updateDateKey) return a.updateDateKey < b.updateDateKey ? 1 : -1
      const ia = TARGET_MAKERS.findIndex((m) => m.key === a.id)
      const ib = TARGET_MAKERS.findIndex((m) => m.key === b.id)
      return ia - ib
    })
}
