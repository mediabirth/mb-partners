/**
 * F-2：Card / Surface — 白背景・--line枠・--radius の標準コンテナ。BR-0トークン参照。
 * pad で内側余白、hover で row/card のホバー演出（既存 .lift/.card-hover と整合）。
 */
import React from 'react'

type Pad = 'none' | 'sm' | 'md' | 'lg'
const PAD: Record<Pad, string> = { none: '0', sm: '12px 14px', md: '14px 16px', lg: '18px 20px' }

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  pad?: Pad
  radius?: 'sm' | 'md' | 'lg'
  hover?: boolean
}

export default function Card({ pad = 'md', radius = 'lg', hover, className, style, ...rest }: CardProps) {
  const r = radius === 'sm' ? 'var(--radius-sm)' : radius === 'md' ? 'var(--radius)' : 'var(--radius-lg)'
  return (
    <div
      className={[hover ? 'card-hover lift' : '', className].filter(Boolean).join(' ')}
      style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: r, padding: PAD[pad], ...style }}
      {...rest}
    />
  )
}
