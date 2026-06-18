/**
 * F-2：StatusPill — 全サーフェス・全用途のステータス表現を1コンポーネントに集約。
 * 色は BR-0 の意味色トークン（--st-*）のみ。tone で用途別バリアントを表現する。
 * 用途別のラベル⇄tone 解決は lib/status.ts のリゾルバ（dealStatus / paymentState 等）を使う。
 */
import React from 'react'

export type Tone = 'success' | 'progress' | 'warn' | 'danger' | 'neutral'

const TONE: Record<Tone, { c: string; bg: string }> = {
  success:  { c: 'var(--st-success)',  bg: 'var(--st-success-bg)' },
  progress: { c: 'var(--st-progress)', bg: 'var(--st-progress-bg)' },
  warn:     { c: 'var(--st-warn)',     bg: 'var(--st-warn-bg)' },
  danger:   { c: 'var(--st-danger)',   bg: 'var(--st-danger-bg)' },
  neutral:  { c: 'var(--st-neutral)',  bg: 'var(--st-neutral-bg)' },
}

const SIZE = {
  sm: { fontSize: 'var(--fs-micro)', padding: '2px 8px' },
  md: { fontSize: 'var(--fs-cap)', padding: '3px 9px' },
}

export type StatusPillProps = {
  tone: Tone
  size?: 'sm' | 'md'
  dot?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}

export default function StatusPill({ tone, size = 'md', dot, children, style }: StatusPillProps) {
  const t = TONE[tone]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
        fontWeight: 'var(--fw-strong)' as unknown as number, color: t.c, background: t.bg,
        borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap', lineHeight: 1.5,
        ...SIZE[size], ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.c, flexShrink: 0 }} />}
      {children}
    </span>
  )
}
