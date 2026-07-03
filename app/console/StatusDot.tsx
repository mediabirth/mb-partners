import React from 'react'
import type { Tone } from '@/components/ui/StatusPill'

/**
 * v2.2：ステータスは塗りピルではなく「6pxドット＋テキスト」で静かに示す
 * （APP正典 app/app/cases/[id]/page.tsx と同じ流儀）。
 * 色は lib/status.ts のリゾルバが返す tone → 意味色トークン（--st-*）のみ。
 * ドットだけが色を持ち、テキストは中立（muted）に保つ。
 */
export default function StatusDot({ tone, children, style }: {
  tone: Tone
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0, ...style }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--st-${tone})`, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted2)' }}>{children}</span>
    </span>
  )
}
