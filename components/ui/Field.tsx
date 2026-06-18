/**
 * F-2：フォーム入力プリミティブ — Input / Select / Textarea / FileField と Field ラッパー。
 * 既存の 1.5px solid var(--line) / radius-sm の入力意匠をトークンで統一。挙動は素の要素のまま。
 */
import React from 'react'

const baseField: React.CSSProperties = {
  width: '100%', border: '1.5px solid var(--line)', borderRadius: 'var(--radius-sm)',
  padding: '9px 12px', fontFamily: 'inherit', fontSize: 'var(--fs-body)', color: 'var(--txt)',
  background: '#fff', outline: 'none',
}

export function Field({ label, hint, required, children, style }: {
  label?: React.ReactNode
  hint?: React.ReactNode
  required?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)', ...style }}>
      {label && (
        <label style={{ fontSize: 'var(--fs-cap)', color: 'var(--muted2)', fontWeight: 'var(--fw-strong)' as unknown as number }}>
          {label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {hint && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--muted)' }}>{hint}</span>}
    </div>
  )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, ...rest }, ref) {
    return <input ref={ref} style={{ ...baseField, ...style }} {...rest} />
  }
)

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ style, ...rest }, ref) {
    return <textarea ref={ref} style={{ ...baseField, resize: 'vertical', lineHeight: 1.6, ...style }} {...rest} />
  }
)

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, children, ...rest }, ref) {
    return <select ref={ref} style={{ ...baseField, cursor: 'pointer', ...style }} {...rest}>{children}</select>
  }
)

export function FileField({ label = 'ファイルを選択', onChange, accept, disabled, style }: {
  label?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement>
  accept?: string
  disabled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer',
      border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-sm)', padding: '9px 14px',
      fontSize: 'var(--fs-sub)', color: 'var(--muted2)', fontWeight: 'var(--fw-medium)' as unknown as number,
      background: 'var(--bg2)', opacity: disabled ? 0.55 : 1, ...style,
    }}>
      {label}
      <input type="file" accept={accept} disabled={disabled} onChange={onChange} style={{ display: 'none' }} />
    </label>
  )
}
