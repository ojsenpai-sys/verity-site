import Link from 'next/link'
import { LoginButton } from './LoginButton'

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="group flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/verity/logo.png.png"
            alt="VERITY"
            className="h-8 w-auto invert transition-all group-hover:drop-shadow-[0_0_10px_#E20074]"
          />
        </Link>

        <nav className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
          <Link href="/" className="hover:text-[var(--magenta)] transition-colors">
            Dashboard
          </Link>
          <Link href="/verity/news" className="hover:text-[var(--magenta)] transition-colors">
            News
          </Link>
          <Link href="/actresses" className="hover:text-[var(--magenta)] transition-colors">
            Actresses
          </Link>
          <LoginButton />
        </nav>
      </div>
    </header>
  )
}
