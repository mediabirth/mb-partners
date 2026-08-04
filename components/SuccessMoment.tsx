'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** EXP-1: 案件ごと・節目ごとに一度だけ見せる成功モーメント。表示専用で状態や金額を更新しない。 */
export default function SuccessMoment({ eventKey, kind }: { eventKey: string; kind: 'contract' | 'reward' }) {
  const [visible, setVisible] = useState(false)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const key = `mb-success-moment:${eventKey}`
    if (window.localStorage.getItem(key)) return
    window.localStorage.setItem(key, '1')
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    setReduced(prefersReduced)
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), prefersReduced ? 700 : kind === 'reward' ? 1500 : 1180)
    return () => window.clearTimeout(timer)
  }, [eventKey, kind])

  if (!visible || typeof document === 'undefined') return null
  const label = kind === 'reward' ? '報酬が確定しました' : 'ご成約となりました'
  const pieces = Array.from({ length: reduced || kind !== 'reward' ? 0 : 18 }, (_, i) => ({
    left: 8 + ((i * 37) % 84),
    delay: (i % 6) * 55,
    rotate: (i * 47) % 180,
    color: ['var(--c-blue)', 'var(--green)', '#8B5CF6', '#F2A93B'][i % 4],
  }))

  return createPortal(
    <div className={`success-moment success-moment--${kind}`} role="status" aria-live="polite" data-success-moment={kind}>
      <style>{`
        .success-moment{position:fixed;inset:0;z-index:140;pointer-events:none;display:grid;place-items:center;background:rgba(255,255,255,.08)}
        .success-moment__card{position:relative;z-index:2;display:flex;align-items:center;gap:10px;padding:13px 18px;border:1px solid rgba(71,51,230,.18);border-radius:999px;background:rgba(255,255,255,.96);box-shadow:0 16px 50px rgba(14,14,20,.16);color:var(--txt);font-size:.8rem;font-weight:500;animation:success-card 1.18s cubic-bezier(.16,1.3,.3,1) both}
        .success-moment__check{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--c-blue);color:#fff;animation:success-check .45s cubic-bezier(.16,1.5,.3,1) both}
        .success-moment--reward .success-moment__check{background:var(--green)}
        .success-moment__piece{position:absolute;top:46%;width:7px;height:11px;border-radius:2px;opacity:0;animation:success-confetti 1.35s cubic-bezier(.18,.7,.28,1) both;animation-delay:var(--piece-delay);background:var(--piece-color)}
        @keyframes success-card{0%{opacity:0;transform:scale(.82) translateY(8px)}28%,72%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(.98) translateY(-5px)}}
        @keyframes success-check{from{opacity:0;transform:scale(.35) rotate(-18deg)}to{opacity:1;transform:scale(1) rotate(0)}}
        @keyframes success-confetti{0%{opacity:0;transform:translate3d(0,-8px,0) rotate(var(--piece-rotate))}18%{opacity:1}100%{opacity:0;transform:translate3d(calc((var(--piece-left) - 50) * .35px),120px,0) rotate(calc(var(--piece-rotate) + 240deg))}}
        @media(prefers-reduced-motion:reduce){.success-moment__card,.success-moment__check,.success-moment__piece{animation:none!important}.success-moment__piece{display:none}}
      `}</style>
      {pieces.map((piece, i) => <span key={i} className="success-moment__piece" style={{ left: `${piece.left}%`, ['--piece-left' as string]: piece.left, ['--piece-delay' as string]: `${piece.delay}ms`, ['--piece-rotate' as string]: `${piece.rotate}deg`, ['--piece-color' as string]: piece.color }} />)}
      <div className="success-moment__card"><span className="success-moment__check" aria-hidden>✓</span><span>{label}</span></div>
    </div>,
    document.body,
  )
}
