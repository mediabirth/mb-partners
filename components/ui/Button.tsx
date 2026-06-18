/**
 * F-2 デザインシステム：Button — 3サーフェス共通。BR-0トークンのみ参照。
 * 純プレゼンテーション（挙動・ロジックは持たない）。variant×size で見た目を統一。
 */
import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const SIZE: Record<Size, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 'var(--fs-cap)', borderRadius: 'var(--radius-sm)' },
  md: { padding: '9px 16px', fontSize: 'var(--fs-sub)', borderRadius: 'var(--radius-sm)' },
  lg: { padding: '12px 20px', fontSize: 'var(--fs-body)', borderRadius: 'var(--radius)' },
}

const VARIANT: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)' },
  secondary: { background: '#fff', color: 'var(--txt)', border: '1px solid var(--line)' },
  ghost:     { background: 'transparent', color: 'var(--muted2)', border: '1px solid transparent' },
  danger:    { background: 'var(--red)', color: '#fff', border: '1px solid var(--red)' },
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  block?: boolean
}

export default function Button({ variant = 'primary', size = 'md', block, style, disabled, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      style={{
        fontFamily: 'inherit', fontWeight: 'var(--fw-strong)' as unknown as number,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        display: block ? 'flex' : 'inline-flex', width: block ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 6,
        lineHeight: 1, whiteSpace: 'nowrap', transition: 'opacity .15s var(--ease-out), filter .15s var(--ease-out)',
        ...SIZE[size], ...VARIANT[variant], ...style,
      }}
      {...rest}
    />
  )
}
