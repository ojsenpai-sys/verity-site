# design-sync notes — VERITY

## Repo shape
- This is a **Next.js 16 app** (Tailwind 4, CSS-first `@theme`), **not** a component-library/Storybook DS.
- No `dist/`, no stories, no renderable component build. The converter scripts (package/storybook shapes) do not apply.
- Components in `src/components/` are mostly coupled to Supabase / server actions / `next/navigation` / live data → not standalone-renderable.

## Sync decision (2026-06-21)
- Scope chosen by user: **tokens + conventions only** (off-script layout, no `_ds_bundle.js`).
- Purpose: let Claude Design build the new HeroSection on-brand. See memory `claude-design-hero-redesign`.

## Source of truth
- Design tokens: `src/app/verity/globals.css` (`:root` CSS vars + `@theme inline` font vars + `.glow-magenta` + keyframes).
- Fonts: Geist sans/mono via `next/font/google` (`src/app/layout.tsx`).
- Best idiom reference: `src/components/HeroSection.tsx`.

## Re-sync
- No `_ds_sync.json` anchor produced (tokens-only; cheap to re-verify). Next sync re-builds the layout by hand.
