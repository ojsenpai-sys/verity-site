import Link from 'next/link'
import { ArrowRight, Sparkles, Ruler, Gem, Users2, ChevronRight } from 'lucide-react'
import { FanzaLink } from '@/components/FanzaLink'
import { LovedollProductImage } from '@/components/lovedoll/LovedollProductImage'
import { getLovedollProducts, type LovedollProduct } from '@/lib/lovedoll/getProducts'
import { LOVEDOLL_LANDING_URL } from '@/lib/lovedoll/config'
import { withAffiliate } from '@/lib/affiliate'

// VERITY LOVE DOLL特集ページ。
// データは事前生成スナップショット(src/lib/lovedoll/products.json)のみを参照する静的ページ。
// SSR/ビルド時にDMM APIを直接呼ばない。掲載商品・掲載順は src/lib/lovedoll/config.ts が正本。
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

export const metadata = {
  title: 'FANZAラブドールおすすめ｜VERITY厳選リアルドール',
  description:
    'VERITYがFANZAに掲載されているラブドール・リアルドールの中から、女優コラボモデルとおすすめの一体を厳選して紹介。価格・素材・スペックを商品ページの情報にもとづいて掲載しています。',
  alternates: { canonical: `${BASE}/verity/lovedoll` },
}

const CTA_TARGET_ID = 'lovedoll_all' // 一覧CTAは特定CIDを持たないためsentinel値（他のfanza_click同様 target_id列は自由文字列）

function formatYen(n: number | null): string | null {
  if (n == null) return null
  return `¥${n.toLocaleString('ja-JP')}`
}

function ProductCTA({ product, className }: { product: LovedollProduct; className?: string }) {
  const href = withAffiliate(product.url) ?? product.url
  return (
    <FanzaLink
      href={href}
      targetId={product.cid}
      position="lovedoll_product"
      className={
        className ??
        'inline-flex items-center justify-center gap-2 rounded-full bg-[#c5a059] px-6 py-3 text-sm font-black tracking-wide text-[#0a0a0d] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#d4b06c] active:scale-95'
      }
    >
      FANZAで詳細を見る
      <ArrowRight size={15} className="shrink-0" />
    </FanzaLink>
  )
}

function SpecBadges({ product }: { product: LovedollProduct }) {
  const { heightCm, cup, material } = product.spec
  if (heightCm == null && cup == null && material == null) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {heightCm != null && <SpecBadge label={`身長 ${heightCm}cm`} />}
      {cup != null && <SpecBadge label={`${cup}カップ`} />}
      {material != null && <SpecBadge label={material} />}
    </div>
  )
}

function SpecBadge({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.3)', color: '#c5a059' }}
    >
      {label}
    </span>
  )
}

function PriceRow({ product }: { product: LovedollProduct }) {
  const price = formatYen(product.price)
  const listPrice = formatYen(product.listPrice)
  if (!price && !listPrice) return null
  return (
    <p className="flex items-baseline gap-2">
      {price && (
        <span className="text-2xl font-black" style={{ color: '#c5a059' }}>
          {price}
        </span>
      )}
      {product.discountPct != null && listPrice && (
        <span className="text-sm line-through opacity-50" style={{ color: 'var(--text)' }}>
          {listPrice}
        </span>
      )}
    </p>
  )
}

function StockBadge({ product }: { product: LovedollProduct }) {
  // stock値の意味は "stock"(在庫あり)のみ確認済み。それ以外/不明な値は在庫ありと断定せず何も表示しない。
  if (!product.inStock) return null
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
      style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}
    >
      在庫あり
    </span>
  )
}

// ── SPECIAL COLLABORATION / VERITY PICK 共通の大型カード ──────────────────────
function ModelFeature({
  product,
  label,
  imageFirst,
}: {
  product: LovedollProduct
  label: string
  imageFirst: boolean
}) {
  const name = product.actress[0] ?? product.title
  return (
    <div
      className={`flex flex-col gap-6 rounded-2xl p-6 sm:p-8 md:items-center md:gap-10 ${
        imageFirst ? 'md:flex-row' : 'md:flex-row-reverse'
      }`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs shrink-0 overflow-hidden rounded-xl bg-[var(--surface-2)] md:w-1/2 md:max-w-none">
        <LovedollProductImage src={product.imageSmall} alt={name} />
      </div>

      <div className="space-y-3 md:w-1/2">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-[0.15em]"
          style={{ background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.35)', color: '#c5a059' }}
        >
          {label}
        </span>
        <h3 className="text-xl font-black" style={{ color: 'var(--text)' }}>
          {name}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text)', opacity: 0.75 }}>
          {product.title}
        </p>
        {product.maker && (
          <p className="text-xs" style={{ color: 'var(--text)', opacity: 0.55 }}>
            メーカー: {product.maker}
          </p>
        )}
        <PriceRow product={product} />
        <div className="flex flex-wrap items-center gap-2">
          <StockBadge product={product} />
          <SpecBadges product={product} />
        </div>
        {product.editorialComment && (
          <div
            className="rounded-lg px-4 py-3 text-xs leading-relaxed"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', opacity: 0.85 }}
          >
            <p className="mb-1 text-[10px] font-bold tracking-widest" style={{ color: '#c5a059', opacity: 1 }}>
              WHY WE PICKED IT
            </p>
            {product.editorialComment}
          </div>
        )}
        <div className="pt-1">
          <ProductCTA
            product={product}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#c5a059] px-6 py-3 text-sm font-black tracking-wide text-[#0a0a0d] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#d4b06c] active:scale-95"
          />
        </div>
      </div>
    </div>
  )
}

function MoreCard({ product }: { product: LovedollProduct }) {
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="relative aspect-[3/4] w-full bg-[var(--surface-2)]">
        <LovedollProductImage src={product.imageSmall} alt={product.title} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.maker && (
          <p className="text-[10px] font-semibold" style={{ color: '#c5a059' }}>
            {product.maker}
          </p>
        )}
        <h4 className="line-clamp-2 text-xs font-medium leading-snug" style={{ color: 'var(--text)' }}>
          {product.title}
        </h4>
        <PriceRow product={product} />
        <div className="flex flex-wrap items-center gap-1.5">
          <StockBadge product={product} />
        </div>
        <SpecBadges product={product} />
        <div className="mt-auto pt-1">
          <ProductCTA
            product={product}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-[#c5a059] py-2 text-[11px] font-bold text-[#0a0a0d] transition-all hover:bg-[#d4b06c] active:scale-95"
          />
        </div>
      </div>
    </article>
  )
}

const WHAT_IS_TILES = [
  { icon: Sparkles, title: 'REAL FACE', desc: '精巧に作り込まれた顔立ちが魅力。メーカーごとに異なる表情や造形の違いを楽しめます。' },
  { icon: Ruler, title: 'FULL SIZE', desc: '等身大サイズで作られたモデルが中心。存在感のあるリアルなプロポーションです。' },
  { icon: Gem, title: 'PREMIUM MATERIAL', desc: 'フルシリコンをはじめ、質感にこだわった素材が使われています。' },
  { icon: Users2, title: 'COLLABORATION', desc: '人気女優とのコラボモデルなど、話題性の高いラインナップも展開されています。' },
] as const

const HOW_TO_CHOOSE = [
  { title: 'SIZE', desc: '身長やボディサイズは商品ごとに異なります。設置スペースや取り扱いのしやすさも考慮して選びましょう。' },
  { title: 'MATERIAL', desc: '素材によって質感や耐久性の印象は変わります。商品ページの説明をよく確認しましょう。' },
  { title: 'DESIGN', desc: '顔立ちやヘッドの種類は商品ごとに個性があります。写真でしっかり確認するのがおすすめです。' },
  { title: 'PRICE', desc: '価格帯は商品によって幅があります。ご予算に合わせて比較検討しましょう。' },
] as const

export default function LovedollPage() {
  const { collaboration, verityPick, more } = getLovedollProducts()
  const ctaHref = withAffiliate(LOVEDOLL_LANDING_URL) ?? LOVEDOLL_LANDING_URL

  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:py-14">
      {/* ── FIRST VIEW ── */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 text-center sm:p-14"
        style={{
          background: 'linear-gradient(135deg, #0a0a0d 0%, #14101a 45%, #0d0a10 100%)',
          border: '1px solid rgba(197,160,89,0.35)',
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.2em] uppercase"
          style={{ background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.35)', color: '#c5a059' }}
        >
          VERITY SPECIAL FEATURE
        </span>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl" style={{ color: '#f0f0f8' }}>
          LOVE DOLL
        </h1>
        <p className="mt-2 text-base font-bold tracking-[0.25em] sm:text-lg" style={{ color: '#c5a059' }}>
          REALITY, REDEFINED.
        </p>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed sm:text-base" style={{ color: 'rgba(240,240,248,0.75)' }}>
          精巧な作り込みで人気を集める国内メーカーのラブドール・リアルドール。VERITYがFANZAに掲載されている商品の中から、女優コラボモデルとおすすめの一体を厳選してご紹介します。
        </p>
        <p className="mt-4 text-[11px]" style={{ color: 'rgba(197,160,89,0.5)' }}>
          ※本ページはアフィリエイトリンクを含むプロモーションです
        </p>
      </section>

      {/* ── WHAT IS LOVE DOLL? ── */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
          WHAT IS LOVE DOLL?
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {WHAT_IS_TILES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-2 rounded-xl p-4 text-center sm:p-5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <Icon size={22} style={{ color: '#c5a059' }} />
              <p className="text-xs font-black tracking-wide" style={{ color: 'var(--text)' }}>
                {title}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text)', opacity: 0.65 }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SPECIAL COLLABORATION ── */}
      {collaboration.length > 0 && (
        <section className="space-y-6">
          <div className="text-center">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.2em] uppercase"
              style={{ background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.35)', color: '#c5a059' }}
            >
              SPECIAL COLLABORATION
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
              女優コラボモデル
            </h2>
          </div>
          <div className="space-y-6">
            {collaboration.map((p, i) => (
              <ModelFeature key={p.cid} product={p} label={`MODEL 0${i + 1}`} imageFirst={i % 2 === 0} />
            ))}
          </div>
        </section>
      )}

      {/* ── VERITY'S PICK ── */}
      {verityPick.length > 0 && (
        <section className="space-y-6">
          <div className="text-center">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.2em] uppercase"
              style={{ background: 'rgba(197,160,89,0.12)', border: '1px solid rgba(197,160,89,0.35)', color: '#c5a059' }}
            >
              VERITY PICK
            </span>
            <h2 className="mt-3 text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
              VERITY編集部が注目した一体
            </h2>
          </div>
          <div className="space-y-6">
            {verityPick.map((p, i) => (
              <ModelFeature key={p.cid} product={p} label="VERITY PICK" imageFirst={i % 2 === 0} />
            ))}
          </div>
        </section>
      )}

      {/* ── HOW TO CHOOSE ── */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
          HOW TO CHOOSE
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {HOW_TO_CHOOSE.map(({ title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <ChevronRight size={16} className="mt-0.5 shrink-0" style={{ color: '#c5a059' }} />
              <div>
                <p className="text-xs font-black tracking-wide" style={{ color: 'var(--text)' }}>
                  {title}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--text)', opacity: 0.65 }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MORE SELECTION ── */}
      {more.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-center text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
            MORE SELECTION
          </h2>
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <div
              className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory
                          [scrollbar-width:none] [-ms-overflow-style:none]
                          [&::-webkit-scrollbar]:hidden
                          sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:pb-0"
            >
              {more.map((p) => (
                <div key={p.cid} className="w-[46vw] max-w-[220px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink">
                  <MoreCard product={p} />
                </div>
              ))}
            </div>
            <p className="mt-1 text-center text-[10px] tracking-widest sm:hidden" style={{ color: 'rgba(197,160,89,0.4)' }}>
              ← スワイプして全{more.length}点を見る →
            </p>
          </div>
        </section>
      )}

      {/* ── LOVE DOLL PRICE RANGE ── */}
      <section
        className="space-y-4 rounded-2xl p-6 sm:p-8"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-center text-xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
          LOVE DOLL PRICE RANGE
        </h2>
        <p className="text-center text-[11px] leading-relaxed" style={{ color: 'var(--text)', opacity: 0.55 }}>
          ※今回確認したFANZA掲載のラブドール商品(サンプル20件)における価格の一例です。FANZA掲載商品全体の平均・公式統計ではありません。
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '最安値', value: '¥28,900' },
            { label: '最高値', value: '¥500,000' },
            { label: '平均(参考)', value: '¥389,003' },
            { label: '中央値(参考)', value: '¥462,244' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg py-4 text-center" style={{ background: 'var(--surface-2)' }}>
              <p className="text-[10px] opacity-55" style={{ color: 'var(--text)' }}>
                {label}
              </p>
              <p className="mt-1 text-base font-black" style={{ color: '#c5a059' }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 text-center sm:p-12"
        style={{
          background: 'linear-gradient(135deg, #0a0a0d 0%, #14101a 45%, #0d0a10 100%)',
          border: '1px solid rgba(197,160,89,0.35)',
        }}
      >
        <h2 className="text-2xl font-black tracking-tight sm:text-3xl" style={{ color: '#f0f0f8' }}>
          FIND YOUR MODEL.
        </h2>
        <div className="mt-6">
          <FanzaLink
            href={ctaHref}
            targetId={CTA_TARGET_ID}
            position="lovedoll_cta"
            className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full px-8 py-3.5 text-sm font-black tracking-wide transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
          >
            <span className="absolute inset-0 rounded-full" style={{ background: '#c5a059' }} />
            <span className="relative z-10" style={{ color: '#0a0a0d' }}>
              FANZAでラブドールをすべて見る
            </span>
            <ArrowRight size={16} className="relative z-10 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" style={{ color: '#0a0a0d' }} />
          </FanzaLink>
        </div>
        <p className="mt-4 text-[11px]" style={{ color: 'rgba(197,160,89,0.5)' }}>
          ※アフィリエイトリンクを含みます
        </p>
        <div className="mt-6">
          <Link href="/verity" className="text-xs underline opacity-60" style={{ color: 'var(--text)' }}>
            VERITYトップへ戻る
          </Link>
        </div>
      </section>
    </div>
  )
}
