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
    cids: [
      'snos00300', 'snos00291', 'snos00261', 'ofje00653',
      'snos00327', 'snos00271', 'snos00316', 'snos00301',
      'snos00247', 'snos00312', 'snos00293', 'snos00263',
      'snos00292', 'snos00296', 'snos00318', 'snos00370',
      'snos00326', 'snos00308', 'snos00307', 'snos00320',
      'ofje00647', 'ofje00648',
    ],
    actressMap: {},
  },
  {
    id: 'honchu',
    label: '本中',
    cids: [
      // 今回解禁の最新作（先頭に追加）
      'hmn00870', 'hmn00878', 'hndb279', 'hmn00912',
      'hmn00866', 'hmn00869', 'hmn00885',
      // 既存掲載（維持）
      'hmn00890', 'hmn00888', 'hmn00883', 'hmn00880', 'hmn00860',
    ],
    actressMap: {
      hmn00890: 'RINOA',
      hmn00888: '秋山美杏',
      hmn00883: '鈴の家りん',
      hmn00880: '五日市芽依',
      hmn00860: '根尾あかり',
    },
  },
  {
    id: 'moodyz',
    label: 'ムーディーズ',
    cids: [
      'mida00709', 'mida00677', 'mida00718', 'mird00284', 'mngs00065',
      'mngs00084', 'mida00645', 'mida00756', 'mida00717', 'mikr00109',
      'mida00711', 'mida00700', 'mida00706', 'mida00705', 'mizd00545',
      'mida00707', 'mida00708', 'mizd00531', 'mngs00064', 'mida00702',
    ],
    actressMap: {
      mida00709: '恋川こもも',
      mida00677: '桃尻うらら',
      mida00718: '来栖唯希',
      mird00284: '九野ひなの・金松季歩・桜空もも・伊藤舞雪',
      mngs00065: '新井リマ',
      mngs00084: '春陽モカ',
      mida00645: '三咲まゆ',
      mida00756: '北乃衣織',
      mida00717: '篠真有',
      mikr00109: '森日向子',
      mida00711: 'うんぱい',
      mida00700: '葉山みりあ',
      mida00706: '石原希望',
      mida00705: '宮下玲奈',
      mizd00545: '天宮花南',
      mida00707: '泉ももか',
      mida00708: '九野ひなの',
      mizd00531: '七沢みあ',
      mngs00064: '美園和花',
      mida00702: '奥井千晴',
    },
  },
  {
    id: 'premium',
    label: 'プレミアム',
    cids: ['pred00880', 'prwf00014', 'pred00878', 'pred00886', 'pred00879', 'pred00870'],
    actressMap: {
      pred00880: '音無鈴',
      prwf00014: '小松空',
      pred00878: '楪カレン',
      pred00886: '彩月七緒',
      pred00879: '三好佑香',
      pred00870: '幸村泉希',
    },
  },
  {
    id: 'ebody',
    label: 'E-BODY',
    cids: ['ebwh00342', 'ebwh00348', 'ebwh00341', 'ebwh00345', 'mkck00425', 'ebwh00344', 'ebwh00359', 'ebwh00349'],
    actressMap: {
      ebwh00342: '柏木ふみか',
      ebwh00348: '葵いぶき',
      ebwh00341: '莉々はるか',
      ebwh00345: '吉木聖奈',
      mkck00425: '莉々はるか',
      ebwh00344: '東峯日奈子',
      ebwh00359: '園田茉莉華',
      ebwh00349: '小花のん',
    },
  },
  {
    id: 'oppai',
    label: 'OPPAI',
    cids: ['pppe00426', 'pppe00430', 'pppe00428', 'pppe00422', 'pppe00429'],
    actressMap: {
      pppe00426: '楪カレン',
      pppe00430: '三木環奈',
      pppe00428: '春陽モカ',
      pppe00422: '中山ふみか',
      pppe00429: '役野満里奈',
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
