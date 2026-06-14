'use client'
import { useEffect, useState } from 'react'

/**
 * Lightweight number count-up. Animates 0 → value with an easeOutCubic curve
 * via requestAnimationFrame (no library). Respects prefers-reduced-motion:
 * when reduced, the final value is shown immediately. Display-only — the
 * underlying value/logic is unchanged.
 */
export default function CountUp({
  value,
  durationMs = 900,
  format = 'number',
}: {
  value: number
  durationMs?: number
  // String flag (not a function) so this can be used from Server Components.
  format?: 'number' | 'yen'
}) {
  const fmt = (n: number) =>
    format === 'yen' ? `¥${Math.round(n).toLocaleString()}` : Math.round(n).toLocaleString()
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || value === 0) {
      setDisplay(value)
      return
    }
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = Math.min(1, (t - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setDisplay(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setDisplay(value)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, durationMs])

  return <>{fmt(display)}</>
}
