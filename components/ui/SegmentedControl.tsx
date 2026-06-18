/**
 * F-2：SegmentedControl / Tabs — 既存の「ボード/アーカイブ」切替と同じ見た目を共通化。BR-0トークン参照。
 */
import React from 'react'

export type Segment<T extends string = string> = { value: T; label: React.ReactNode }

export default function SegmentedControl<T extends string = string>({ value, onChange, options, style }: {
  value: T
  onChange: (v: T) => void
  options: Segment<T>[]
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', padding: 3, ...style }}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--fs-sub)',
              fontWeight: 'var(--fw-strong)' as unknown as number, padding: '7px 14px', borderRadius: 7,
              color: active ? 'var(--txt)' : 'var(--muted2)',
              background: active ? '#fff' : 'transparent',
              boxShadow: active ? '0 1px 4px rgba(14,14,20,.1)' : 'none',
              transition: 'color .15s var(--ease-out)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
