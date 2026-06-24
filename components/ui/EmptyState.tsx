/**
 * 憲法v1：EmptyState — リスト0件の統一プレースホルダ。静かな一文（＋任意アクション）。「—」を出さない。
 * .ui-empty（globals.css）でトーン/余白を統一。純プレゼンテーション（データ/認証/お金に非接触）。
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
    <div className="ui-empty" style={{ ...(compact ? { padding: '18px 20px' } : null), ...style }}>
      {icon && <div style={{ fontSize: '1.4rem', marginBottom: 8, opacity: .6 }} aria-hidden="true">{icon}</div>}
      <p style={{ fontSize: 'var(--fs-sub)', fontWeight: 'var(--fw-medium)' as unknown as number, color: 'var(--t-secondary)' }}>{title}</p>
      {hint && <p style={{ fontSize: 'var(--fs-cap)', color: 'var(--t-tertiary)', marginTop: 4 }}>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}
