'use client'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// 憲法v1 §8 準拠 Tag（selectable）。白地0.5px枠／選択時 青枠＋青文字＋rgba(71,51,230,0.07)。
// accent='green' でサービス系の緑選択も可（既存の2色セマンティクスを維持）。状態は .ui-tag 系（globals.css）。

export type TagProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  selected?: boolean
  accent?: 'blue' | 'green'
  children?: ReactNode
}

export default function Tag({ selected = false, accent = 'blue', children, className = '', ...rest }: TagProps) {
  const cls = `ui-tag${accent === 'green' ? ' ui-tag--green' : ''}${selected ? ' ui-tag--on' : ''}${className ? ' ' + className : ''}`
  return <button type="button" className={cls} aria-pressed={selected} {...rest}>{children}</button>
}
