'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import type { Actress } from '@/lib/types'
import type { TitleDef } from '@/lib/titles'
import { EPITHET_MAP } from '@/lib/epithets'

export type StatusCardProps = {
  displayName:          string
  equippedEpithet:      string | null
  activeTitle:          TitleDef | null
  starsCount:           number
  isLegend:             boolean
  lpTotalAccumulated:   number
  loginDays:            number
  favoriteActresses:    Actress[]
  crownActressIds:      string[]
  lpPointsMap:          Record<string, number>
}

const W        = 600
const H        = 840
const IMG_H    = 390   // grid zone height
const PAD      = 28    // stats zone horizontal padding
const GRID_PAD = 10    // grid outer padding
const GRID_GAP = 8     // gap between cells

type Rarity = 'normal' | 'silver' | 'gold' | 'platinum'
type Images = { king: HTMLImageElement | null; actressImgs: (HTMLImageElement | null)[] }

// ── Token colour palette (9 slots) ───────────────────────────────────────────

const TOKEN_PALETTES = [
  { rgb: '226,0,116'   },   // 0 magenta
  { rgb: '14,165,233'  },   // 1 sky
  { rgb: '139,92,246'  },   // 2 violet
  { rgb: '245,158,11'  },   // 3 amber
  { rgb: '16,185,129'  },   // 4 emerald
  { rgb: '244,63,94'   },   // 5 rose
  { rgb: '99,102,241'  },   // 6 indigo
  { rgb: '249,115,22'  },   // 7 orange
  { rgb: '100,116,139' },   // 8 slate
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function rRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawLCorners(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  len: number, col: string, glow?: string, lw = 1.5,
) {
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10 }
  ctx.strokeStyle = col; ctx.lineWidth = lw
  ctx.beginPath(); ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len); ctx.stroke()
  ctx.shadowBlur = 0
}

function seeded(n: number): number { const x = Math.sin(n + 1) * 10000; return x - Math.floor(x) }

function accentRgb(rarity: Rarity, isLegend: boolean): string {
  if (isLegend || rarity === 'gold') return '251,191,36'
  if (rarity === 'silver')           return '180,205,225'
  return '226,0,116'
}

function toCanvasSrc(url: string): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
    }
  } catch { /* relative */ }
  return url
}

// ── Background ────────────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, rarity: Rarity) {
  if (rarity === 'normal') {
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H)
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.95)
    v.addColorStop(0, 'transparent'); v.addColorStop(1, 'rgba(226,0,116,0.07)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    return
  }
  if (rarity === 'silver') {
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#090909'); bg.addColorStop(0.45, '#1c1c1c'); bg.addColorStop(1, '#0d0d0d')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    const sh = ctx.createLinearGradient(0, 0, W, H)
    sh.addColorStop(0.42, 'rgba(195,215,235,0.05)')
    sh.addColorStop(0.5,  'rgba(215,228,240,0.10)')
    sh.addColorStop(0.58, 'rgba(195,215,235,0.05)')
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H)
    return
  }
  if (rarity === 'gold') {
    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#0a0700'); bg.addColorStop(0.5, '#1c1100'); bg.addColorStop(1, '#110c00')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W / 2, IMG_H * 0.5, 0, W / 2, IMG_H * 0.5, H * 0.55)
    glow.addColorStop(0, 'rgba(251,191,36,0.09)'); glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
    return
  }
  ctx.fillStyle = '#030108'; ctx.fillRect(0, 0, W, H)
  const holo = ctx.createLinearGradient(0, 0, W, H)
  holo.addColorStop(0,   'rgba(255,0,128,0.09)');  holo.addColorStop(0.2, 'rgba(0,255,200,0.07)')
  holo.addColorStop(0.4, 'rgba(120,0,255,0.09)'); holo.addColorStop(0.6, 'rgba(255,210,0,0.07)')
  holo.addColorStop(0.8, 'rgba(0,160,255,0.08)');  holo.addColorStop(1,   'rgba(255,0,200,0.07)')
  ctx.fillStyle = holo; ctx.fillRect(0, 0, W, H)
  const pulse = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.75)
  pulse.addColorStop(0, 'rgba(226,0,116,0.1)'); pulse.addColorStop(1, 'transparent')
  ctx.fillStyle = pulse; ctx.fillRect(0, 0, W, H)
}

function drawBgDetails(ctx: CanvasRenderingContext2D, rarity: Rarity) {
  const rgb = rarity === 'gold' ? '251,191,36' : rarity === 'silver' ? '180,205,225' : '226,0,116'
  ctx.strokeStyle = `rgba(${rgb},0.022)`; ctx.lineWidth = 0.5
  for (let x = 0; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  ctx.strokeStyle = `rgba(${rgb},0.055)`; ctx.lineWidth = 0.5
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = `rgba(${rgb},${(seeded(i * 13.7) * 0.05 + 0.015).toFixed(3)})`
    ctx.lineWidth = 0.5
    ctx.setLineDash([seeded(i * 3.1) * 14 + 5, seeded(i * 5.9) * 38 + 18])
    ctx.beginPath(); ctx.moveTo(seeded(i * 7.31) * W, 0); ctx.lineTo(seeded(i * 7.31) * W, H); ctx.stroke()
  }
  ctx.setLineDash([])
  if (rarity === 'gold' || rarity === 'platinum') {
    for (let i = 0; i < 35; i++) {
      const pa = seeded(i * 19.3 + 4) * 0.28 + 0.08
      ctx.fillStyle = rarity === 'platinum'
        ? `hsla(${(seeded(i * 23.7 + 5) * 360) | 0},80%,70%,${pa.toFixed(2)})`
        : `rgba(251,191,36,${pa.toFixed(2)})`
      ctx.beginPath()
      ctx.arc(seeded(i * 11.3 + 1) * W, seeded(i * 7.7 + 2) * H, seeded(i * 3.1 + 3) * 1.8 + 0.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawBorder(ctx: CanvasRenderingContext2D, rarity: Rarity, isLegend: boolean) {
  const rgb = accentRgb(rarity, isLegend)
  for (const [d, a, lw] of [[0, 0.8, 1], [4, 0.3, 2], [11, 0.12, 4]] as const) {
    ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.lineWidth = lw
    ctx.strokeRect(14 - d, 14 - d, W - 28 + d * 2, H - 28 + d * 2)
  }
  if (rarity === 'platinum') {
    for (const [d, a, lw] of [[2, 0.5, 1], [7, 0.18, 2]] as const) {
      ctx.strokeStyle = `rgba(0,210,255,${a})`; ctx.lineWidth = lw
      ctx.strokeRect(14 - d, 14 - d, W - 28 + d * 2, H - 28 + d * 2)
    }
  }
  ctx.strokeStyle = `rgba(${rgb},0.18)`; ctx.lineWidth = 1
  ctx.strokeRect(22, 22, W - 44, H - 44)
}

function drawCardCorners(ctx: CanvasRenderingContext2D, rarity: Rarity, isLegend: boolean) {
  const rgb = accentRgb(rarity, isLegend)
  const off = 26; const len = 40
  drawLCorners(ctx, off, off, W - off * 2, H - off * 2, len, `rgba(${rgb},0.9)`, `rgba(${rgb},0.55)`, 2)
  const in2 = off + 10; const inLen = 24
  ctx.strokeStyle = `rgba(${rgb},0.22)`; ctx.lineWidth = 1
  ctx.setLineDash([2, 5])
  const cornerPaths = [
    [[in2, in2 + inLen], [in2, in2], [in2 + inLen, in2]],
    [[W - in2 - inLen, in2], [W - in2, in2], [W - in2, in2 + inLen]],
    [[in2, H - in2 - inLen], [in2, H - in2], [in2 + inLen, H - in2]],
    [[W - in2 - inLen, H - in2], [W - in2, H - in2], [W - in2, H - in2 - inLen]],
  ]
  for (const [[x1, y1], [x2, y2], [x3, y3]] of cornerPaths) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke()
  }
  ctx.setLineDash([])
  for (const [px, py] of [[off, off], [W - off, off], [off, H - off], [W - off, H - off]] as const) {
    ctx.fillStyle = `rgba(${rgb},0.8)`
    ctx.shadowColor = `rgba(${rgb},0.7)`; ctx.shadowBlur = 8
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }
}

// ── 3×3 Name-token grid ───────────────────────────────────────────────────────

type GridProps = {
  favoriteActresses: Actress[]
  crownActressIds:   string[]
  aceId:             string | null
  actressImgs:       (HTMLImageElement | null)[]
  rarity:            Rarity
  isLegend:          boolean
  crownCount:        number
}

function drawNameTokenGrid(ctx: CanvasRenderingContext2D, p: GridProps) {
  const { favoriteActresses, crownActressIds, aceId, actressImgs, isLegend, rarity, crownCount } = p
  const accentVal  = accentRgb(rarity, isLegend)
  const isMaxCrown = crownCount >= 9

  const gridW = W - GRID_PAD * 2
  const gridH = IMG_H - GRID_PAD * 2
  const cellW = Math.floor((gridW - GRID_GAP * 2) / 3)
  const cellH = Math.floor((gridH - GRID_GAP * 2) / 3)
  const RADIUS = 8

  // 9/9: golden pulse over entire grid zone
  if (isMaxCrown) {
    const pulse = ctx.createRadialGradient(W / 2, IMG_H / 2, 0, W / 2, IMG_H / 2, W * 0.8)
    pulse.addColorStop(0, 'rgba(251,191,36,0.18)'); pulse.addColorStop(1, 'transparent')
    ctx.fillStyle = pulse; ctx.fillRect(0, 0, W, IMG_H)
    for (const [d, a, lw] of [[0, 0.8, 2.5], [7, 0.32, 5], [18, 0.12, 10]] as const) {
      ctx.strokeStyle = `rgba(251,191,36,${a})`; ctx.lineWidth = lw
      ctx.strokeRect(-d, -d, W + d * 2, IMG_H + d * 2)
    }
  }

  for (let i = 0; i < 9; i++) {
    const col     = i % 3
    const row     = Math.floor(i / 3)
    const cx      = GRID_PAD + col * (cellW + GRID_GAP)
    const cy      = GRID_PAD + row * (cellH + GRID_GAP)
    const actress = favoriteActresses[i] ?? null
    const isCrown = actress ? crownActressIds.includes(actress.id) : false
    const isAce   = actress?.id === aceId
    const palette = TOKEN_PALETTES[i]

    // ── Empty slot ──────────────────────────────────────────────────────────
    if (!actress) {
      ctx.save()
      rRect(ctx, cx, cy, cellW, cellH, RADIUS); ctx.clip()
      ctx.fillStyle = '#06030f'; ctx.fillRect(cx, cy, cellW, cellH)
      ctx.restore()

      rRect(ctx, cx, cy, cellW, cellH, RADIUS)
      ctx.strokeStyle = `rgba(${accentVal},0.1)`; ctx.lineWidth = 1; ctx.stroke()

      ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(${accentVal},0.18)`
      ctx.fillText('🔒', cx + cellW / 2, cy + cellH / 2 - 8)
      ctx.font = 'bold 7px "Courier New", monospace'; ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = `rgba(${accentVal},0.22)`
      ctx.fillText('COMING SOON', cx + cellW / 2, cy + cellH / 2 + 10)
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      continue
    }

    // ── Occupied slot ────────────────────────────────────────────────────────

    // Background (clipped)
    ctx.save()
    rRect(ctx, cx, cy, cellW, cellH, RADIUS); ctx.clip()
    ctx.fillStyle = '#060210'; ctx.fillRect(cx, cy, cellW, cellH)

    // Radial colour accent
    const bgGrad = ctx.createRadialGradient(
      cx + cellW * 0.5, cy + cellH * 0.38, 0,
      cx + cellW * 0.5, cy + cellH * 0.38, cellH * 0.75,
    )
    bgGrad.addColorStop(0, `rgba(${palette.rgb},0.30)`)
    bgGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = bgGrad; ctx.fillRect(cx, cy, cellW, cellH)

    const img = actressImgs[i] ?? null
    if (img) {
      // Official photo: cover-fit
      const scale = Math.max(cellW / img.width, cellH / img.height)
      const dw    = img.width  * scale
      const dh    = img.height * scale
      ctx.globalAlpha = 0.75
      ctx.drawImage(img, cx + (cellW - dw) / 2, cy + (cellH - dh) / 2, dw, dh)
      ctx.globalAlpha = 1
      // Bottom gradient for name readability
      const ng = ctx.createLinearGradient(cx, cy + cellH - 36, cx, cy + cellH)
      ng.addColorStop(0, 'transparent'); ng.addColorStop(1, 'rgba(0,0,0,0.88)')
      ctx.fillStyle = ng; ctx.fillRect(cx, cy + cellH - 36, cellW, 36)
    } else {
      // Name token: avatar circle + first kanji
      const avR  = Math.min(cellW, cellH) * 0.29
      const avX  = cx + cellW / 2
      const avY  = cy + cellH * 0.42

      // Circle bg
      ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${palette.rgb},0.20)`; ctx.fill()
      ctx.strokeStyle = `rgba(${palette.rgb},0.55)`; ctx.lineWidth = 1.5; ctx.stroke()

      // First character (kanji or initial)
      const char     = actress.name.charAt(0)
      const charSize = Math.max(14, Math.floor(avR * 1.05))
      ctx.font        = `bold ${charSize}px "Helvetica Neue", Helvetica, sans-serif`
      ctx.textAlign   = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle   = `rgba(${palette.rgb},0.95)`
      ctx.shadowColor = `rgba(${palette.rgb},0.65)`; ctx.shadowBlur = 10
      ctx.fillText(char, avX, avY)
      ctx.shadowBlur  = 0
      ctx.textBaseline = 'alphabetic'
    }
    ctx.restore()  // end clip

    // ── Crown glow (outside clip) ───────────────────────────────────────────
    if (isCrown) {
      const glowRgb = isMaxCrown ? '255,230,80' : '251,191,36'
      for (const [d, a, lw] of [[0, 0.8, 2], [4, 0.32, 3.5], [10, 0.1, 6]] as const) {
        ctx.strokeStyle = `rgba(${glowRgb},${a})`; ctx.lineWidth = lw
        rRect(ctx, cx - d, cy - d, cellW + d * 2, cellH + d * 2, RADIUS); ctx.stroke()
      }
      if (isMaxCrown) {
        ctx.shadowColor = 'rgba(251,191,36,0.9)'; ctx.shadowBlur = 18
        ctx.strokeStyle = 'rgba(255,230,80,0.95)'; ctx.lineWidth = 2
        rRect(ctx, cx, cy, cellW, cellH, RADIUS); ctx.stroke()
        ctx.shadowBlur = 0
      }
    }

    // ── ACE glow ─────────────────────────────────────────────────────────────
    if (isAce) {
      for (const [d, a, lw] of [[0, 0.9, 2], [5, 0.28, 4]] as const) {
        ctx.strokeStyle = `rgba(226,0,116,${a})`; ctx.lineWidth = lw
        rRect(ctx, cx - d, cy - d, cellW + d * 2, cellH + d * 2, RADIUS); ctx.stroke()
      }
    }

    // ── Actress name at bottom ────────────────────────────────────────────────
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.font = '10px sans-serif'
    let name = actress.name
    while (ctx.measureText(name).width > cellW - 14 && name.length > 2) name = name.slice(0, -1)
    if (name !== actress.name) name = name.slice(0, -1) + '…'
    ctx.fillStyle = isCrown ? 'rgba(255,228,80,0.95)' : 'rgba(240,240,248,0.88)'
    ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 3
    ctx.fillText(name, cx + cellW / 2, cy + cellH - 5)
    ctx.shadowBlur = 0; ctx.textAlign = 'left'

    // ── Index badge (top-left) ────────────────────────────────────────────────
    ctx.font = '7px "Courier New", monospace'
    ctx.fillStyle = `rgba(${palette.rgb},0.55)`
    ctx.fillText(`0${i + 1}`.slice(-2), cx + 5, cy + 13)

    // ── Crown badge (top-right) ───────────────────────────────────────────────
    if (isCrown) {
      ctx.font = '13px sans-serif'; ctx.textAlign = 'right'
      if (isMaxCrown) { ctx.shadowColor = 'rgba(251,191,36,0.85)'; ctx.shadowBlur = 10 }
      ctx.fillStyle = isMaxCrown ? 'rgba(255,228,80,0.98)' : 'rgba(251,191,36,0.9)'
      ctx.fillText('♛', cx + cellW - 4, cy + 16)
      ctx.shadowBlur = 0; ctx.textAlign = 'left'
    }

    // ── ACE badge ────────────────────────────────────────────────────────────
    if (isAce) {
      const bw = 26; const bh = 13; const by = cy + (isCrown ? 20 : 4)
      rRect(ctx, cx + cellW - bw - 4, by, bw, bh, 2)
      ctx.fillStyle = 'rgba(226,0,116,0.9)'; ctx.fill()
      ctx.font = 'bold 7px "Courier New", monospace'
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
      ctx.fillText('ACE', cx + cellW - 4 - bw / 2, by + 9)
      ctx.textAlign = 'left'
    }

    // ── L-corner decorations ──────────────────────────────────────────────────
    const cCol  = isCrown ? 'rgba(251,191,36,0.8)' : isAce ? 'rgba(226,0,116,0.85)' : `rgba(${palette.rgb},0.5)`
    const cGlow = isCrown ? 'rgba(251,191,36,0.4)' : isAce ? 'rgba(226,0,116,0.35)' : undefined
    drawLCorners(ctx, cx, cy, cellW, cellH, 10, cCol, cGlow, 1.5)
  }

  // Separator line between grid and stats zone
  const lineGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
  lineGrad.addColorStop(0, 'transparent')
  lineGrad.addColorStop(0.15, `rgba(${accentVal},0.55)`)
  lineGrad.addColorStop(0.85, `rgba(${accentVal},0.55)`)
  lineGrad.addColorStop(1, 'transparent')
  ctx.strokeStyle = lineGrad; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, IMG_H); ctx.lineTo(W - PAD, IMG_H); ctx.stroke()
}

// ── Stats zone (bottom half) ─────────────────────────────────────────────────

type StatsProps = {
  displayName:        string
  equippedEpithet:    string | null
  activeTitle:        TitleDef | null
  starsCount:         number
  isLegend:           boolean
  lpTotalAccumulated: number
  loginDays:          number
  rarity:             Rarity
  crownCount:         number
}

function drawStatRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string, value: string,
  fill: number, rgb: string,
  glowLevel: 0 | 1 | 2 = 0,
  sublabel?: string,
) {
  const barW = W - PAD * 2

  ctx.font = 'bold 11px "Courier New", monospace'
  ctx.fillStyle = `rgba(${rgb},0.58)`
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4
  ctx.fillText(label, PAD, y); ctx.shadowBlur = 0

  ctx.font = 'bold 26px "Courier New", monospace'
  if (glowLevel === 2) {
    ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = 24; ctx.fillStyle = '#fff9f9'
  } else if (glowLevel === 1) {
    ctx.shadowColor = `rgba(${rgb},0.6)`; ctx.shadowBlur = 14; ctx.fillStyle = `rgba(${rgb},0.98)`
  } else {
    ctx.fillStyle = `rgba(${rgb},0.95)`
  }
  ctx.textAlign = 'right'; ctx.fillText(value, W - PAD, y); ctx.textAlign = 'left'
  ctx.shadowBlur = 0

  if (sublabel) {
    ctx.font = '9px "Courier New", monospace'
    ctx.fillStyle = `rgba(${rgb},0.32)`
    ctx.textAlign = 'right'; ctx.fillText(sublabel, W - PAD, y + 14); ctx.textAlign = 'left'
  }

  const barY = y + 26
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(PAD, barY, barW, 3)
  if (fill > 0) {
    const bg = ctx.createLinearGradient(PAD, 0, PAD + barW, 0)
    bg.addColorStop(0, `rgba(${rgb},0.95)`); bg.addColorStop(1, `rgba(${rgb},0.2)`)
    ctx.fillStyle = bg; ctx.fillRect(PAD, barY, barW * fill, 3)
    ctx.shadowColor = `rgba(${rgb},0.9)`; ctx.shadowBlur = glowLevel === 2 ? 12 : 8
    ctx.fillStyle = `rgba(${rgb},1)`; ctx.fillRect(PAD + barW * fill - 2, barY - 1, 2, 5)
    ctx.shadowBlur = 0
  }
}

function drawStatsZone(ctx: CanvasRenderingContext2D, p: StatsProps) {
  const { displayName, equippedEpithet, activeTitle, starsCount, isLegend,
          lpTotalAccumulated, loginDays, rarity, crownCount } = p
  const rgb = accentRgb(rarity, isLegend)
  const SY  = IMG_H + 14

  // Logo + stars
  ctx.shadowColor = 'rgba(226,0,116,0.9)'; ctx.shadowBlur = 14
  ctx.font = 'bold 19px "Courier New", monospace'; ctx.fillStyle = '#E20074'
  ctx.fillText('VERITY', PAD, SY + 24); ctx.shadowBlur = 0

  const starCount = isLegend ? 3 : starsCount === 6 ? 2 : starsCount >= 3 ? 1 : 0
  ctx.shadowColor = 'rgba(251,191,36,0.8)'; ctx.shadowBlur = 7
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < starCount ? '#fbbf24' : 'rgba(251,191,36,0.18)'
    ctx.font = 'bold 15px sans-serif'; ctx.fillText('★', PAD + 78 + i * 19, SY + 24)
  }
  ctx.shadowBlur = 0

  const tierLabel: Record<Rarity, string> = {
    normal: '[ STD ]', silver: '[ SILVER ]', gold: '[ GOLD ]', platinum: '[ PLATINUM ]',
  }
  ctx.font = '10px "Courier New", monospace'; ctx.fillStyle = `rgba(${rgb},0.4)`
  ctx.textAlign = 'right'; ctx.fillText(tierLabel[rarity], W - PAD, SY + 24); ctx.textAlign = 'left'

  const dg = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
  dg.addColorStop(0, `rgba(${rgb},0.6)`); dg.addColorStop(0.6, `rgba(${rgb},0.25)`); dg.addColorStop(1, 'transparent')
  ctx.strokeStyle = dg; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, SY + 36); ctx.lineTo(W - PAD, SY + 36); ctx.stroke()

  // Epithet badge
  let nameY = SY + 80
  if (equippedEpithet) {
    const def = EPITHET_MAP[equippedEpithet]
    if (def) {
      const cols: Record<string, string> = {
        common: '#94a3b8', rare: '#38bdf8', epic: '#c084fc', legendary: '#fbbf24',
      }
      const col = cols[def.rarity] ?? '#94a3b8'
      ctx.font = 'bold 10px "Courier New", monospace'
      const tw = ctx.measureText(def.name).width
      rRect(ctx, PAD, SY + 44, tw + 20, 22, 3)
      ctx.fillStyle = col + '20'; ctx.fill()
      ctx.strokeStyle = col + '99'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6
      ctx.fillText(def.name, PAD + 10, SY + 44 + 15); ctx.shadowBlur = 0
      nameY = SY + 90
    }
  }

  // Display name
  ctx.textBaseline = 'middle'
  let nameFont = 48
  const nameStr = displayName || 'VERITY USER'
  ctx.font = `bold ${nameFont}px "Helvetica Neue", Helvetica, sans-serif`
  while (ctx.measureText(nameStr).width > W - PAD * 2 - 10 && nameFont > 22) {
    nameFont -= 2
    ctx.font = `bold ${nameFont}px "Helvetica Neue", Helvetica, sans-serif`
  }
  ctx.fillStyle = '#f0f0f8'
  ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 8
  ctx.fillText(nameStr, PAD, nameY)
  ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic'

  // Active title
  const halfName = nameFont / 2
  if (activeTitle) {
    ctx.font = '14px sans-serif'; ctx.fillStyle = `rgba(${rgb},0.8)`
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 5
    ctx.fillText(`${activeTitle.icon}  ${activeTitle.name}`, PAD, nameY + halfName + 22)
    ctx.shadowBlur = 0
  }

  // Divider before stats
  const statDivY = nameY + halfName + (activeTitle ? 42 : 22)
  ctx.strokeStyle = 'rgba(36,36,52,0.9)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, statDivY); ctx.lineTo(W - PAD, statDivY); ctx.stroke()

  const s1Y = statDivY + 28
  const lpGl: 0 | 1 | 2 = lpTotalAccumulated >= 500 ? 2 : lpTotalAccumulated >= 100 ? 1 : 0
  drawStatRow(ctx, s1Y, '◈  TOTAL LOVE', lpTotalAccumulated.toLocaleString(), Math.min(lpTotalAccumulated / 1000, 1), rgb, lpGl)

  const s2Y = s1Y + 52
  drawStatRow(ctx, s2Y, '⊕  LOGIN DAYS', `${loginDays}`, Math.min(loginDays / 180, 1), '56,189,248', 0, 'DAYS OF LOYALTY')

  // Crown count
  const s3Y = s2Y + 56
  const isMaxCrown = crownCount >= 9
  ctx.font = 'bold 11px "Courier New", monospace'
  ctx.fillStyle = isMaxCrown ? 'rgba(255,228,80,0.85)' : `rgba(${rgb},0.58)`
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4
  ctx.fillText('◆  CROWN COUNT', PAD, s3Y); ctx.shadowBlur = 0

  ctx.font = 'bold 26px "Courier New", monospace'
  if (isMaxCrown) {
    ctx.shadowColor = 'rgba(251,191,36,0.95)'; ctx.shadowBlur = 28; ctx.fillStyle = '#fffde7'
  } else {
    ctx.fillStyle = 'rgba(251,191,36,0.95)'
  }
  ctx.textAlign = 'right'; ctx.fillText(`${crownCount} / 9`, W - PAD, s3Y); ctx.textAlign = 'left'
  ctx.shadowBlur = 0

  // Crown pip bar
  const barW  = W - PAD * 2
  const pipGap = 4
  const pipW   = Math.floor((barW - pipGap * 8) / 9)
  const pipY   = s3Y + 12
  for (let i = 0; i < 9; i++) {
    const px = PAD + i * (pipW + pipGap)
    if (isMaxCrown && i < crownCount) {
      ctx.shadowColor = 'rgba(251,191,36,0.75)'; ctx.shadowBlur = 10; ctx.fillStyle = '#ffe566'
    } else {
      ctx.fillStyle = i < crownCount ? '#fbbf24' : 'rgba(251,191,36,0.13)'
    }
    ctx.fillRect(px, pipY, pipW, 5); ctx.shadowBlur = 0
  }
  if (isMaxCrown) {
    ctx.font = 'bold 10px "Courier New", monospace'
    ctx.fillStyle = 'rgba(251,191,36,0.8)'
    ctx.shadowColor = 'rgba(251,191,36,0.5)'; ctx.shadowBlur = 10
    ctx.textAlign = 'center'; ctx.fillText('◈  ALL CROWNED  ◈', W / 2, pipY + 22); ctx.textAlign = 'left'
    ctx.shadowBlur = 0
  }

  // Legend badge
  if (isLegend) {
    ctx.font = 'bold 11px "Courier New", monospace'
    ctx.fillStyle = '#fbbf24'; ctx.shadowColor = 'rgba(251,191,36,0.65)'; ctx.shadowBlur = 12
    ctx.textAlign = 'center'; ctx.fillText('◈  LEGEND OF VERITY  ◈', W / 2, H - 34); ctx.textAlign = 'left'
    ctx.shadowBlur = 0
  }

  // Watermark
  ctx.font = '9px "Courier New", monospace'; ctx.fillStyle = 'rgba(226,0,116,0.18)'
  ctx.textAlign = 'right'; ctx.fillText('verity-official.com', W - PAD, H - 18); ctx.textAlign = 'left'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatusCard({
  displayName, equippedEpithet, activeTitle, starsCount, isLegend,
  lpTotalAccumulated, loginDays, favoriteActresses, crownActressIds, lpPointsMap,
}: StatusCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<Images>({ king: null, actressImgs: [] })

  const crownCount = crownActressIds.length
  const rarity: Rarity = crownCount >= 9 ? 'platinum' : crownCount >= 6 ? 'gold' : crownCount >= 3 ? 'silver' : 'normal'

  // ACE = actress with highest LP points
  const maxLp = favoriteActresses.reduce((m, a) => Math.max(m, lpPointsMap[a.id] ?? 0), 0)
  const aceId: string | null = maxLp > 0
    ? (favoriteActresses.reduce((b, a) => (lpPointsMap[a.id] ?? 0) > (lpPointsMap[b.id] ?? 0) ? a : b, favoriteActresses[0])?.id ?? null)
    : null

  // Load only official_photo_url from metadata (never package/DMM images)
  const officialUrlKey = favoriteActresses.slice(0, 9)
    .map(a => (a.metadata?.official_photo_url as string | undefined) ?? '')
    .join('|')

  useEffect(() => {
    const loadImg = (src: string): Promise<HTMLImageElement | null> =>
      new Promise(resolve => {
        const finalSrc = toCanvasSrc(src)
        if (!finalSrc) { resolve(null); return }
        const img = new Image()
        img.onload  = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = finalSrc
      })

    const officialUrls = favoriteActresses.slice(0, 9)
      .map(a => (a.metadata?.official_photo_url as string | undefined) ?? '')

    Promise.all([
      loadImg('/assets/verity/king.png'),
      ...officialUrls.map(url => loadImg(url)),
    ]).then(([king, ...actressImgs]) =>
      setImages({ king: king as HTMLImageElement | null, actressImgs })
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officialUrlKey])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    drawBackground(ctx, rarity)
    drawBgDetails(ctx, rarity)

    // Ghost king watermark in stats zone
    if (images.king) {
      ctx.save(); ctx.globalAlpha = 0.04
      const ks = 180
      ctx.drawImage(images.king, (W - ks) / 2, IMG_H + (H - IMG_H - ks) / 2, ks, ks)
      ctx.restore()
    }

    drawBorder(ctx, rarity, isLegend)
    drawNameTokenGrid(ctx, {
      favoriteActresses, crownActressIds, aceId,
      actressImgs: images.actressImgs, rarity, isLegend, crownCount,
    })
    drawStatsZone(ctx, {
      displayName, equippedEpithet, activeTitle, starsCount, isLegend,
      lpTotalAccumulated, loginDays, rarity, crownCount,
    })
    drawCardCorners(ctx, rarity, isLegend)
  }, [displayName, equippedEpithet, activeTitle, starsCount, isLegend, lpTotalAccumulated, loginDays,
      favoriteActresses, crownActressIds, aceId, images, rarity, crownCount])

  useEffect(() => { draw() }, [draw])

  function downloadCard() {
    draw()
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.download = 'verity-status.png'
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-xl border border-[var(--border)] overflow-hidden"
        style={{ maxWidth: '100%', maxHeight: 560, objectFit: 'contain' }}
      />
      <button
        onClick={downloadCard}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2
                   text-xs text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]
                   transition-colors"
      >
        <Download size={12} />
        ステータスカードをダウンロード（PNG · 600×840）
      </button>
    </div>
  )
}
