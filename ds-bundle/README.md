# VERITY — design conventions

VERITY is a Japanese AV curation media site. The look is **dark, cinematic, premium**, with a single hot **magenta** accent. Build every design on these tokens and idioms — do not invent your own palette or spacing scale.

## Setup / wrapping

There is **no JS provider to wrap** — VERITY styling is pure CSS tokens + Tailwind utilities. All you need is reachable from `styles.css` (tokens, fonts, effects are `@import`ed there). Put designs on the dark canvas:

```html
<body class="bg-[var(--bg)] text-[var(--text)] font-sans">
```

`font-sans` resolves to **Geist** (mono is Geist Mono). The page background is `--bg`; cards sit on `--surface`.

## Styling idiom — Tailwind 4 + CSS-variable arbitrary values

VERITY uses **Tailwind utility classes**, and brand colors are referenced as **CSS-variable arbitrary values**, not Tailwind color names. This is the single most important convention:

| Use | Not |
|---|---|
| `bg-[var(--surface)]` | `bg-gray-900` |
| `text-[var(--text)]`, `text-[var(--text-muted)]` | `text-white`, `text-gray-400` |
| `border-[var(--border)]` | `border-gray-700` |
| `text-[var(--magenta)]` | `text-pink-600` |

Opacity modifiers work on these: `bg-[var(--magenta)]/10`, `border-[var(--magenta)]/30`, `from-[var(--magenta)]/60`.

### Color tokens (exact names — see `tokens/colors.css`)
- `--magenta` `#E20074` — **primary accent**: CTAs, links, focus ring, "Today's Hero" badge. `--magenta-dim` `#b30059` for pressed/darker.
- `--bg` `#0a0a0f` page · `--surface` `#12121a` cards · `--surface-2` `#1a1a26` raised · `--border` `#2a2a3a` hairlines.
- `--text` `#f0f0f8` primary · `--text-muted` `#8888aa` meta/secondary.

### Secondary accents (standard Tailwind hues, used for variants)
- **Flash / urgency** → `amber-400` / `orange-500` (gradient `from-amber-500 to-orange-500`).
- **CTA gradient end** → `rose-600` (`from-[var(--magenta)] to-rose-600`).
- **VR** → `violet-300/400/500` · **DVD** → `blue-300/400/500` · **Ranking #1** → `amber-400` neon pulse.

## Shape & motion vocabulary
- **Cards**: `rounded-2xl border border-[var(--border)] bg-[var(--surface)]`, often `overflow-hidden` with a 1px top accent gradient line.
- **Pills/badges**: `rounded-full`, tiny uppercase label `text-[10px] font-black tracking-[0.18em] uppercase`, tinted bg + matching border (e.g. `border-[var(--magenta)]/30 bg-[var(--magenta)]/10 text-[var(--magenta)]`).
- **Primary CTA**: `rounded-full` gradient button, white bold text, glow shadow + `hover:brightness-110` + `active:scale-[0.97]`. Magenta variant: `bg-gradient-to-r from-[var(--magenta)] to-rose-600 shadow-[0_0_24px_rgba(226,0,116,0.40)]`.
- **Covers**: poster aspect `aspect-[2/3]`, `rounded-xl`, heavy drop shadow `shadow-[0_12px_48px_rgba(0,0,0,0.70)]`; group-hover `scale-105`.
- **Glow**: `.glow-magenta` utility, or arbitrary `shadow-[0_0_Npx_rgba(226,0,116,0.X)]`. Keyframes available: `marquee`, `neon-crown-pulse` (`.crown-neon-frame`), `lp-float` (see `tokens/effects.css`).
- **Icons**: lucide-react (`Flame`, `Zap`, `ExternalLink`, etc.) at 10–14px inside badges/CTAs.

## Where the truth lives
- `tokens/colors.css`, `tokens/effects.css`, `fonts/fonts.css` — all reachable from `styles.css`.
- `components/foundations/Colors` & `Typography` — swatches + type scale.
- `components/patterns/HeroSection` — reference mockup of the two Hero variants (Today's Hero / Today's Flash). **When redesigning the Hero, start from this.**

## Idiomatic snippet — a "Today's Hero" card

```html
<section class="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 flex gap-8 items-center">
  <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--magenta)]/60 via-amber-400/40 to-transparent"></div>
  <div class="aspect-[2/3] w-[180px] shrink-0 rounded-xl bg-[var(--surface-2)] shadow-[0_12px_48px_rgba(0,0,0,0.70)]"><!-- COVER 2:3 --></div>
  <div class="flex flex-col gap-3.5 min-w-0">
    <span class="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--magenta)]/30 bg-[var(--magenta)]/10 px-3 py-1 text-[10px] font-black tracking-[0.18em] uppercase text-[var(--magenta)]">Today's Hero</span>
    <a class="text-sm font-bold text-[var(--magenta)] hover:underline">女優名</a>
    <h2 class="line-clamp-3 text-[17px] font-bold leading-relaxed text-[var(--text)]">作品タイトル</h2>
    <a class="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.40)] hover:brightness-110 active:scale-[0.97]">▶ FANZAで今すぐ観る</a>
  </div>
</section>
```

---

## What's in this project

| Path | What it is |
|---|---|
| `styles.css` | Style entry point — `@import`s fonts + tokens. Designs receive this closure. |
| `tokens/colors.css` | Color tokens (`--magenta`, `--bg`, `--surface`, …). |
| `tokens/effects.css` | `.glow-magenta`, focus ring, keyframes (`marquee`, `neon-crown-pulse`, `lp-float`). |
| `fonts/fonts.css` | Geist / Geist Mono webfonts + `--font-sans` / `--font-mono`. |
| `components/foundations/Colors` | Color swatch reference card. |
| `components/foundations/Typography` | Type scale reference card. |
| `components/patterns/HeroSection` | Reference mockup of the two Hero variants. |

> Scope: this is a **tokens + conventions** sync from a Next.js app (VERITY), not a compiled component library. Components render in the real app with live data; here you get the brand's visual language to design with.
