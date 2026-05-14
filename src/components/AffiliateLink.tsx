import { ExternalLink } from 'lucide-react'
import type { AffiliateLink as AffiliateLinkType } from '@/lib/types'
import { withAffiliate } from '@/lib/affiliate'

type Props = {
  links: AffiliateLinkType[]
}

export function AffiliateLinkBlock({ links }: Props) {
  if (!links.length) return null

  const sorted = [...links].sort((a, b) => a.display_order - b.display_order)

  return (
    <aside className="rounded-xl border border-[var(--magenta)]/30 bg-[var(--surface)] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--magenta)]">
          関連リンク
        </p>
        <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
          PR
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((link) => (
          <a
            key={link.id}
            href={withAffiliate(link.url) ?? link.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-all group"
          >
            <span>{link.label}</span>
            <ExternalLink
              size={14}
              className="text-[var(--text-muted)] group-hover:text-[var(--magenta)] transition-colors"
            />
          </a>
        ))}
      </div>
    </aside>
  )
}
