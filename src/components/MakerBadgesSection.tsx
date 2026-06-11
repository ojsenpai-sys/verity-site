import { Store } from 'lucide-react'
import { withAffiliate } from '@/lib/affiliate'

type Maker = { name: string; slug: string; tier?: 'S' | 'A' }

const MAKERS: Maker[] = [
  { name: 'S1 NO.1 STYLE', slug: 'S1+NO.1+STYLE', tier: 'S' },
  { name: 'SOD',            slug: 'SOD',            tier: 'S' },
  { name: 'IDEA POCKET',    slug: 'IDEA+POCKET',    tier: 'S' },
  { name: 'MOODYZ',         slug: 'MOODYZ',         tier: 'S' },
  { name: 'PREMIUM',        slug: 'PREMIUM',        tier: 'S' },
  { name: 'E-BODY',         slug: 'E-BODY',         tier: 'A' },
  { name: 'MADONNA',        slug: 'MADONNA',        tier: 'A' },
  { name: 'WANZ FACTORY',   slug: 'WANZ+FACTORY',   tier: 'A' },
  { name: 'PRESTIGE',       slug: 'PRESTIGE',       tier: 'A' },
  { name: 'ATTACKERS',      slug: 'ATTACKERS',      tier: 'A' },
  { name: 'kawaii*',        slug: 'kawaii',         tier: 'A' },
  { name: 'Fitch',          slug: 'Fitch',          tier: 'A' },
  { name: 'GLORY QUEST',    slug: 'GLORY+QUEST',    tier: 'A' },
  { name: 'MAX-A',          slug: 'MAX-A',          tier: 'A' },
  { name: 'ROOKIE',         slug: 'ROOKIE',         tier: 'A' },
  { name: 'V&R PRODUCE',    slug: 'V%26R+PRODUCE'   },
  { name: 'MAXING',         slug: 'MAXING'          },
  { name: 'BeFree',         slug: 'BeFree'          },
  { name: 'TMA',            slug: 'TMA'             },
  { name: 'kira★kira',      slug: 'kira'            },
  { name: 'NATURAL HIGH',   slug: 'NATURAL+HIGH'    },
  { name: 'Dogma',          slug: 'Dogma'           },
  { name: 'Crystal Eizou',  slug: 'Crystal'         },
  { name: 'Rocket',         slug: 'Rocket'          },
  { name: 'Alice JAPAN',    slug: 'Alice+JAPAN'     },
  { name: 'FA Pro.',        slug: 'FA+Pro'          },
  { name: 'OPPAI',          slug: 'OPPAI'           },
  { name: 'Das!',           slug: 'Das'             },
  { name: 'SODstar',        slug: 'SODstar'         },
  { name: 'GIGA',           slug: 'GIGA'            },
  { name: 'Deeps',          slug: 'Deeps'           },
  { name: 'HONNAKA',        slug: 'HONNAKA'         },
  { name: 'DreamRoom',      slug: 'DreamRoom'       },
  { name: 'Virgin High',    slug: 'Virgin+High'     },
  { name: 'Cinemagic',      slug: 'Cinemagic'       },
  { name: 'Big Morkal',     slug: 'Big+Morkal'      },
  { name: 'Globe',          slug: 'Globe'           },
  { name: 'HUNTER',         slug: 'HUNTER'          },
  { name: 'Ruby',           slug: 'Ruby'            },
  { name: 'Aries',          slug: 'Aries'           },
  { name: 'VR PROS',        slug: 'VR+PROS'         },
  { name: 'KM Produce',     slug: 'KM+Produce'      },
  { name: 'Planet Plus',    slug: 'Planet+Plus'     },
  { name: '桃太郎映像',      slug: '%E6%A1%83%E5%A4%AA%E9%83%8E%E6%98%A0%E5%83%8F' },
  { name: 'Hajime Kikaku',  slug: 'Hajime'          },
  { name: '妄想族',          slug: '%E5%A6%84%E6%83%B3%E6%97%8F'  },
  { name: 'Bi-HA',          slug: 'Bi-HA'           },
  { name: 'MERCURY',        slug: 'MERCURY'         },
  { name: 'TIGER',          slug: 'TIGER'           },
  { name: 'GS',             slug: 'GS'              },
  { name: 'SANWA',          slug: 'SANWA'           },
  { name: 'タカラ映像',      slug: '%E3%82%BF%E3%82%AB%E3%83%A9%E6%98%A0%E5%83%8F' },
  { name: 'STAR PARADISE',  slug: 'STAR+PARADISE'   },
  { name: 'VR FISHING',     slug: 'VR+FISHING'      },
  { name: 'Hajime',         slug: 'Hajime+Kikaku'   },
]

function makerUrl(slug: string): string | null {
  return withAffiliate(
    `https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${slug}/`
  )
}

export function MakerBadgesSection() {
  const sTier = MAKERS.filter(m => m.tier === 'S')
  const aTier = MAKERS.filter(m => m.tier === 'A')
  const rest  = MAKERS.filter(m => !m.tier)

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <Store size={17} className="text-[var(--magenta)]" />
        <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
          人気メーカー・レーベル
        </h2>
        <span className="rounded-full bg-[var(--magenta)]/15 px-2.5 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
          {MAKERS.length} メーカー
        </span>
      </div>

      {/* S-tier: large highlighted badges */}
      <div className="flex flex-wrap gap-2">
        {sTier.map(m => {
          const href = makerUrl(m.slug)
          return href ? (
            <a
              key={m.name}
              href={href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--magenta)]/50 bg-[var(--magenta)]/10 px-3 py-1.5 text-xs font-bold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/20 hover:shadow-[0_0_10px_rgba(226,0,116,0.3)]"
            >
              {m.name}
            </a>
          ) : null
        })}
      </div>

      {/* A-tier: medium standard badges */}
      <div className="flex flex-wrap gap-2">
        {aTier.map(m => {
          const href = makerUrl(m.slug)
          return href ? (
            <a
              key={m.name}
              href={href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-[var(--text)] transition-all hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]"
            >
              {m.name}
            </a>
          ) : null
        })}
      </div>

      {/* Rest: small compact badges */}
      <div className="flex flex-wrap gap-1.5">
        {rest.map(m => {
          const href = makerUrl(m.slug)
          return href ? (
            <a
              key={m.name}
              href={href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[var(--magenta)]/30 hover:text-[var(--text)]"
            >
              {m.name}
            </a>
          ) : null
        })}
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        <span className="rounded px-1.5 py-0.5 font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">PR</span>
        {' '}各リンクはFANZAアフィリエイトリンクです
      </p>
    </section>
  )
}
