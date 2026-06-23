'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// HOME「先回り」枠：示唆＋ナッジを静かに最大2件。各々に理由＋アクション＋「後で」（localStorage＝本人端末スコープ・DB/money非接触）。
// 沈黙はノイズに勝る：表示item が無ければ中立のフォールバック1行（却下不可）。

export type PreemptItem = { id: string; badge: string; text: string; href: string; actionLabel: string }

const KEY = 'syn_preempt_dismissed_v1'

export default function SynapsePreempt({ items, fallback }: { items: PreemptItem[]; fallback: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  useEffect(() => { try { const r = localStorage.getItem(KEY); if (r) setDismissed(new Set(JSON.parse(r) as string[])) } catch { /* noop */ } }, [])
  function dismiss(id: string) {
    setDismissed(prev => {
      const n = new Set(prev); n.add(id)
      try { localStorage.setItem(KEY, JSON.stringify([...n])) } catch { /* noop */ }
      return n
    })
  }
  const shown = items.filter(i => !dismissed.has(i.id)).slice(0, 2)

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--blue-bg)', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {shown.length === 0 ? (
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)', background: '#fff', borderRadius: 5, padding: '2px 6px', marginTop: 1 }}>今日の示唆</span>
          <span style={{ minWidth: 0, fontSize: '.64rem', color: 'var(--txt)', lineHeight: 1.65 }}>{fallback}</span>
        </div>
      ) : shown.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: i.badge === '先回り' ? '#fff' : 'var(--blue)', background: i.badge === '先回り' ? 'var(--blue)' : '#fff', borderRadius: 5, padding: '2px 6px', marginTop: 1 }}>{i.badge}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.64rem', color: 'var(--txt)', lineHeight: 1.6 }}>{i.text}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <Link href={i.href} prefetch={false} style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--blue)', textDecoration: 'none' }}>{i.actionLabel} →</Link>
              <button onClick={() => dismiss(i.id)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.6rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>後で</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
