import Link from 'next/link'
import { Flame, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { withAffiliate } from '@/lib/affiliate'
import { toHighResPackageUrl, cidToCdnUrl, isBadImageUrl, coverPosClass } from '@/lib/cidUtils'
import type { Article } from '@/lib/types'

type MakerConfig = {
  id: string
  label: string
  cids: readonly string[]
  actressMap: Record<string, string>
}

const MAKERS: MakerConfig[] = [
  {
    id: 's1',
    label: 'エスワン',
    // 2026-07-14 0時解禁の videoa 全作（DMM配信日順＝先頭ほど新しい）。
    // 単独作に加え、共演作・オールスター総集編も本日解禁分として網羅。
    cids: [
      'snos00361', 'snos00357', 'snos00353', 'snos00334', 'snos00332',
      'snos00323', 'snos00321', 'snos00309', 'snos00306', 'snos00298',
      'snos00297', 'snos00270', 'snos00246', 'snos00065',
      'ofje00652', 'ofje00651', 'ofje00650',
    ],
    actressMap: {
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
    label: 'アイデアポケット',
    // 2026-07-14 0時解禁の videoa 全作（DMM配信日順＝先頭ほど新しい）。
    // 単独作に加え、アイポケBEST総集編も本日解禁分として網羅。
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
    id: 'moodyz',
    label: 'ムーディーズ',
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
    id: 'kawaii',
    label: 'kawaii',
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
  {
    id: 'honchu',
    label: '本中',
    cids: [
      'hmn00899', 'hmn00895', 'hmn00900', 'hndb00282', 'hmn00896',
    ],
    actressMap: {
      hmn00899: '鈴の家りん',
      hmn00895: '朝比奈紗良',
      hmn00900: '竹内有紀',
      hndb00282: '東條なつ',
      hmn00896: '五日市芽依',
    },
  },
  {
    id: 'premium',
    label: 'プレミアム',
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
    label: 'E-BODY',
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
    label: 'OPPAI',
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
]

const ALL_CIDS = MAKERS.flatMap((m) => [...m.cids])

async function getAllArticles(): Promise<Map<string, Article>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, metadata, published_at, tags, slug')
    .in('external_id', ALL_CIDS)
    .eq('is_active', true)
  if (error) console.error('[FastestNewReleases]', error.message)
  return new Map(((data as Article[]) ?? []).map((a) => [a.external_id, a]))
}

function dmmUrl(cid: string): string {
  return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
}

function proxied(url: string): string {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

// DB記事の画像があればそれを、無ければCIDから pl.jpg を再構築。
// coverPosClass は「実際に描画されるURL」で判定する（生 image_url を渡すと null→object-center で
// 背表紙が中央に出るため）。本CID群は jp.jpg 不在で pl 配信＝coverPosClass→object-right。
function effectiveCoverUrl(cid: string, article: Article | undefined): string {
  const raw = article && !isBadImageUrl(article.image_url) ? article.image_url : null
  return toHighResPackageUrl(raw) ?? cidToCdnUrl(cid, 'pl')
}

function getAffiliateUrl(article: Article): string | null {
  const raw =
    typeof article.metadata?.affiliate_url === 'string'
      ? article.metadata.affiliate_url
      : typeof article.metadata?.url === 'string'
      ? article.metadata.url
      : null
  return withAffiliate(raw)
}

export async function FastestNewReleases() {
  const articleMap = await getAllArticles()

  // DB記事があれば優先、無ければCIDから直接カード化（解禁直後でDB未登録でも表示）。
  const makerSections = MAKERS.map((maker) => ({
    id:    maker.id,
    label: maker.label,
    cards: maker.cids.map((cid) => {
      const article = articleMap.get(cid)
      const cover   = effectiveCoverUrl(cid, article)
      return {
        cid,
        title:       article?.title ?? '',
        slug:        article?.slug ?? null,
        coverUrl:    cover,
        imgSrc:      proxied(cover),
        href:        (article ? getAffiliateUrl(article) : null) ?? withAffiliate(dmmUrl(cid)),
        actressName: maker.actressMap[cid] ?? '',
      }
    }),
  })).filter((s) => s.cards.length > 0)

  if (!makerSections.length) return null

  return (
    <section id="fastest-new-releases" className="space-y-8">
      {/* ── ヘッダー ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-orange-500 to-red-600" />
          <Flame size={18} className="text-orange-400 animate-pulse" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            最新作最速更新情報
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/15 px-2.5 py-0.5 text-[10px] font-black text-red-400 border border-red-600/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            NEW
          </span>
        </div>
        <p className="pl-6 text-[11px] tracking-wide text-[var(--text-muted)]">
          解禁されたばかりの最旬注目作を最速でお届け！
        </p>
      </div>

      {/* ── メーカー別セクション ─────────────────────────────────────── */}
      {makerSections.map((section) => (
        <div key={section.id} className="space-y-3">
          <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30 tracking-wider">
            {section.label}
          </span>

          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
            {section.cards.map((card) => {
              const { imgSrc, href, actressName } = card

              return (
                <div
                  key={card.cid}
                  className="shrink-0 w-36 sm:w-auto snap-start rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] flex flex-col group transition-colors hover:border-orange-500/40 hover:shadow-md"
                >
                  {/* ── 表紙画像（FanzaLink直行） ─────────────────────── */}
                  {href ? (
                    <FanzaLink
                      href={href}
                      targetId={card.cid}
                      position="fastest_new_releases"
                      className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
                    >
                      <ProxiedImage
                        src={imgSrc}
                        alt={card.title || card.cid}
                        className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(card.coverUrl)} transition-transform duration-300 ease-out group-hover:scale-105`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <span className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-red-600 text-white shadow-lg">
                        NEW
                      </span>
                      {actressName && (
                        <span className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-0.5 text-[10px] font-bold bg-black/70 text-white backdrop-blur-sm text-center">
                          {actressName}
                        </span>
                      )}
                      {/* ホバーオーバーレイ（PCのみ） */}
                      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/60 md:flex">
                        <span className="translate-y-1 scale-95 rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-bold text-gray-900 opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
                          ▶ FANZAで観る
                        </span>
                      </div>
                    </FanzaLink>
                  ) : (
                    <div className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                      <ProxiedImage
                        src={imgSrc}
                        alt={card.title || card.cid}
                        className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(card.coverUrl)}`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <span className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-red-600 text-white shadow-lg">
                        NEW
                      </span>
                      {actressName && (
                        <span className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-0.5 text-[10px] font-bold bg-black/70 text-white backdrop-blur-sm text-center">
                          {actressName}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── テキストエリア ────────────────────────────────── */}
                  <div className="flex flex-1 flex-col gap-2.5 p-3">
                    {card.title && (
                      card.slug ? (
                        <Link href={`/verity/articles/${card.slug}`}>
                          <p className="flex-1 text-[11px] font-medium leading-snug text-[var(--text)] line-clamp-3 hover:text-[var(--magenta)] transition-colors">
                            {card.title}
                          </p>
                        </Link>
                      ) : (
                        <p className="flex-1 text-[11px] font-medium leading-snug text-[var(--text)] line-clamp-3">
                          {card.title}
                        </p>
                      )
                    )}
                    {href ? (
                      <FanzaLink
                        href={href}
                        targetId={card.cid}
                        position="fastest_new_releases_cta"
                        className="mt-auto flex items-center justify-center gap-1.5 w-full rounded-lg py-2 text-[10px] font-bold tracking-wider bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-400 hover:to-red-500 transition-all shadow-sm"
                      >
                        <ExternalLink size={10} />
                        今すぐ観る
                      </FanzaLink>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
