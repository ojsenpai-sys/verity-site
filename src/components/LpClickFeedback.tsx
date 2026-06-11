'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

type Particle = { id: number; x: number; y: number }

export function LpClickFeedback() {
  const [particles, setParticles] = useState<Particle[]>([])
  const [mounted,   setMounted]   = useState(false)
  const counter = useRef(0)

  useEffect(() => { setMounted(true) }, [])

  const handleClick = useCallback((e: MouseEvent) => {
    const link = (e.target as Element).closest('a[rel*="sponsored"]')
    if (!link) return
    const id = ++counter.current
    const { clientX: x, clientY: y } = e
    setParticles(prev => [...prev, { id, x, y }])
    setTimeout(() => setParticles(prev => prev.filter(p => p.id !== id)), 1400)
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [handleClick])

  if (!mounted || particles.length === 0) return null

  return (
    <>
      {particles.map(p => (
        <div
          key={p.id}
          className="pointer-events-none fixed z-[9999] select-none"
          style={{ left: p.x, top: p.y, animation: 'lp-float 1.3s ease-out forwards' }}
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--magenta)] to-purple-500 px-2.5 py-1 text-[11px] font-black text-white shadow-[0_0_14px_rgba(226,0,116,0.45)]">
            💙 +5 LP
          </span>
        </div>
      ))}
    </>
  )
}
