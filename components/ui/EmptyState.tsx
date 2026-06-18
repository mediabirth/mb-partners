/**
 * F-2：EmptyState — 「〜はありません」の統一プレースホルダ。BR-0トークン参照。
 */
import React from 'react'

export type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
  compact?: boolean
  style?: React.CSSProperties
}

export default function EmptyState({ icon, title, hint, action, compact, style }: EmptyStateProps) {
  return (
    <div style={{ textAlign: 'center', padding: compact ? 'var(--sp-4)' : 'var(--sp-8) var(--sp-4)', color: 'var(--muted2)', ...style }}>
      {icon && <div style={{ fontSize: '1.5rem', marginBottom: 'var(--sp-2)', opacity: 0.7 }}>{icon}</div>}
      <p style={{ fontSize: 'var(--fs-sub)', fontWeight: 'var(--fw-medium)' as unknown as number, color: 'var(--muted2)' }}>{title}</p>
      {hint && <p style={{ fontSize: 'var(--fs-cap)', color: 'var(--muted)', marginTop: 'var(--sp-1)' }}>{hint}</p>}
      {action && <div style={{ marginTop: 'var(--sp-3)' }}>{action}</div>}
    </div>
  )
}
