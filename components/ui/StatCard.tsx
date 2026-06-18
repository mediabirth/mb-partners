/**
 * F-2：StatCard — KPI/数値の統一表示。金額は --fw-display + .tnum。BR-0トークン参照。
 */
import React from 'react'

export type StatCardProps = {
  label: string
  value: React.ReactNode
  unit?: string
  sub?: React.ReactNode
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'neutral'
  style?: React.CSSProperties
}

const ACCENT: Record<NonNullable<StatCardProps['accent']>, string> = {
  blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', neutral: 'var(--txt)',
}

export default function StatCard({ label, value, unit, sub, accent = 'neutral', style }: StatCardProps) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 'var(--sp-4)', ...style }}>
      <p style={{ fontSize: 'var(--fs-cap)', color: 'var(--muted2)', fontWeight: 'var(--fw-medium)' as unknown as number }}>{label}</p>
      <div style={{ marginTop: 'var(--sp-2)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: 'var(--fs-display)', fontWeight: 'var(--fw-display)' as unknown as number, letterSpacing: '-.02em', color: ACCENT[accent], lineHeight: 1.05 }}>{value}</span>
        {unit && <span style={{ fontSize: 'var(--fs-sub)', color: 'var(--muted2)', fontWeight: 'var(--fw-medium)' as unknown as number }}>{unit}</span>}
      </div>
      {sub && <div style={{ marginTop: 'var(--sp-1)', fontSize: 'var(--fs-cap)', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}
