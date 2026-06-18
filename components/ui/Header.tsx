/**
 * F-2：PageHeader / SectionHeader — 画面タイトル・セクション見出しの統一。BR-0トークン参照。
 * 既存の .eyebrow / .ty-h2 ユーティリティと同じ意味づけ（font-size/weight をトークンに固定）。
 */
import React from 'react'

export function PageHeader({ eyebrow, title, right, sticky, style }: {
  eyebrow?: string
  title: React.ReactNode
  right?: React.ReactNode
  sticky?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      className={sticky ? 'console-topbar' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        ...(sticky ? { position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px' } : {}),
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <p className="eyebrow" style={{ marginBottom: 2 }}>{eyebrow}</p>}
        <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 'var(--fw-display)' as unknown as number, lineHeight: 1, letterSpacing: '-.01em' }}>{title}</h1>
      </div>
      {right}
    </div>
  )
}

export function SectionHeader({ title, right, style }: {
  title: React.ReactNode
  right?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-3)', ...style }}>
      <h2 className="ty-h2" style={{ fontSize: 'var(--fs-h2)', fontWeight: 'var(--fw-head)' as unknown as number }}>{title}</h2>
      {right}
    </div>
  )
}
