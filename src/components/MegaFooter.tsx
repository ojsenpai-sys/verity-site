import Link from 'next/link'

// In-page anchor navigation — IDs match section ids in page.tsx
const CONTENT_LEFT = [
  { label: 'THE MUST ONE',      href: '/#the-must-one' },
  { label: 'X SOCIAL FEEDS',    href: '/#social-feeds' },
  { label: 'VERITYオススメ女優', href: '/#recommended-actresses' },
]

const CONTENT_RIGHT = [
  { label: '旬の女優最新作',       href: '/#latest-releases' },
  { label: '【最速】予約・先行公開', href: '/#pre-orders' },
  { label: '今週のリリース',        href: '/#weekly-releases' },
]

const ABOUT_LINKS = [
  { label: '合同会社VERITY',         href: '/contact' },
  { label: 'Contact',               href: '/contact' },
  { label: 'プライバシーポリシー', href: '/privacy' },
]

function FooterCol({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        {title}
      </p>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MegaFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)] mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">

          {/* Col 1 — Brand */}
          <div className="col-span-2 sm:col-span-1 space-y-4">
            <Link href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/verity/logo.png.png"
                alt="VERITY"
                className="h-7 w-auto invert opacity-80 hover:opacity-100 transition-opacity"
              />
            </Link>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              FANZA公式データと直結した<br />AVキュレーション・メディア
            </p>
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2">
              <p className="text-[10px] font-bold text-red-400/80 tracking-wide">
                ⚠️ 18歳未満のアクセスを禁止します
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              © 2026 VERITY. All rights reserved.
            </p>
          </div>

          {/* Col 2 — コンテンツ一覧（前半） */}
          <FooterCol title="コンテンツ一覧" links={CONTENT_LEFT} />

          {/* Col 3 — コンテンツ一覧（後半） */}
          <FooterCol title="　" links={CONTENT_RIGHT} />

          {/* Col 4 — 運営情報 */}
          <FooterCol title="運営情報" links={ABOUT_LINKS} />
        </div>

        <div className="mt-10 border-t border-[var(--border)] pt-6 flex flex-col items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <a
            href="https://affiliate.dmm.com/api/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--magenta)] transition-colors"
          >
            Powered by FANZA Webサービス
          </a>
          <span>
            All content sourced from official FANZA metadata ·{' '}
            <span className="text-[var(--magenta)]/60">VERITY</span>
          </span>
        </div>
      </div>
    </footer>
  )
}
