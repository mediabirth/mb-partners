'use client'
import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// 憲法v1 §8 準拠 Button。primary/secondary/ghost(/danger 後方互換) × sm/md/lg。
// 4状態（hover/active/focus-visible/disabled）はクラス .ui-btn 系（globals.css）で定義。
// busy＝内側spinner＋二度押し不可（disabled）。href を渡すと Link（遷移ロジックは呼び出し側不変）。block＝幅100%。

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  block?: boolean
  href?: string
  prefetch?: boolean
  children?: ReactNode
}

export default function Button({ variant = 'primary', size = 'md', busy = false, block, href, prefetch, children, className = '', disabled, style, ...rest }: ButtonProps) {
  const cls = `ui-btn ui-btn--${variant} ui-btn--${size}${busy ? ' ui-btn--busy' : ''}${className ? ' ' + className : ''}`
  const blockStyle = block ? { display: 'flex', width: '100%', ...(style || {}) } : style
  if (href && !disabled && !busy) {
    return <Link href={href} prefetch={prefetch} className={cls} style={blockStyle}>{children}</Link>
  }
  return (
    <button className={cls} disabled={disabled || busy} aria-disabled={disabled || busy} style={blockStyle} {...rest}>
      {busy && <span className="ui-btn__spin" aria-hidden="true" />}
      {children}
    </button>
  )
}
