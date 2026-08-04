'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// 一覧の提案1行。match/nudge は裏方に保ち、UIは理由＋次の一手だけに絞る。
// 「後で」＝localStorage（本人端末スコープ・DB/money非接触）。表示item が無ければ枠ごと非表示（null＝沈黙）。

export type PreemptItem = { id: string; text: string; href: string; actionLabel: string }

const KEY = 'syn_preempt_dismissed_v1'

export default function SynapsePreempt({ items }: { items: PreemptItem[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  useEffect(() => { try { const r = localStorage.getItem(KEY); if (r) setDismissed(new Set(JSON.parse(r) as string[])) } catch { /* noop */ } setReady(true) }, [])
  function dismiss(id: string) {
    setDismissed(prev => {
      const n = new Set(prev); n.add(id)
      try { localStorage.setItem(KEY, JSON.stringify([...n])) } catch { /* noop */ }
      return n
    })
  }
  const shown = items.filter(i => !dismissed.has(i.id)).slice(0, 1)
  if (ready && shown.length === 0) return null   // 全て却下/0件＝沈黙

  return (
    <div style={{ margin: '0 20px 12px', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '11px 13px' }}>
      <div style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--blue)', marginBottom: 7 }}>合いそうな提案</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(ready ? shown : items.slice(0, 1)).map(i => (
          <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.66rem', color: 'var(--txt)', lineHeight: 1.6 }}>{i.text}</div>
              <div style={{ display: 'flex', gap: 13, marginTop: 5 }}>
                <Link href={i.href} prefetch={false} style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--blue)', textDecoration: 'none' }}>{i.actionLabel} →</Link>
                <button onClick={() => dismiss(i.id)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.62rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>後で</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
