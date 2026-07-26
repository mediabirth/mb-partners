'use client'

import { useState } from 'react'
import {
  changeAppPassword,
  changeConsolePassword,
  changeVendorPassword,
  requestAppEmailChange,
  requestConsoleEmailChange,
  requestVendorEmailChange,
  type PasswordChangeResult,
} from '@/app/account-security/actions'

type Surface = 'app' | 'vendor' | 'console'
type FieldErrors = Partial<Record<'current' | 'password' | 'confirmation' | 'email', string>>

const FIELD: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  border: '0.5px solid var(--line)',
  borderRadius: 9,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: '.8rem',
  background: '#fff',
  boxSizing: 'border-box',
}

export default function AccountSecurityPanel({ surface, email }: { surface: Surface; email: string }) {
  const [mode, setMode] = useState<'password' | 'email' | null>(null)
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [nextEmail, setNextEmail] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [rateLimited, setRateLimited] = useState(false)
  const [debugLinks, setDebugLinks] = useState<{ current: string; next: string } | null>(null)

  function open(next: 'password' | 'email') {
    setMode(next)
    setErrors({})
    setNotice('')
    setRateLimited(false)
    setDebugLinks(null)
  }

  function close() {
    setMode(null)
    setCurrent('')
    setPassword('')
    setConfirmation('')
    setNextEmail('')
    setErrors({})
  }

  function passwordErrors(result?: PasswordChangeResult): FieldErrors {
    const next: FieldErrors = {}
    if (!current) next.current = '現在のパスワードを入力してください'
    if (password.length < 8) next.password = '8文字以上で入力してください'
    if (!confirmation) next.confirmation = '確認用パスワードを入力してください'
    else if (password !== confirmation) next.confirmation = '新しいパスワードが一致しません'
    if (result && !result.ok) {
      if (result.error === 'current-required') next.current = '現在のパスワードを入力してください'
      if (result.error === 'current-invalid') next.current = '現在のパスワードが正しくありません'
      if (result.error === 'password-too-short') next.password = '8文字以上で入力してください'
      if (result.error === 'password-mismatch') next.confirmation = '新しいパスワードが一致しません'
    }
    return next
  }

  async function submitPassword() {
    const local = passwordErrors()
    if (Object.keys(local).length) {
      setErrors(local)
      return
    }
    setBusy(true)
    setErrors({})
    const action = surface === 'vendor'
      ? changeVendorPassword
      : surface === 'console'
        ? changeConsolePassword
        : changeAppPassword
    const result = await action(current, password, confirmation)
    if (!result.ok) {
      const next = passwordErrors(result)
      if (result.error === 'update-failed') next.password = '変更できませんでした。時間をおいて再度お試しください'
      setErrors(next)
      setBusy(false)
      return
    }
    setNotice('パスワードを変更しました')
    setBusy(false)
    close()
  }

  async function submitEmail() {
    const normalized = nextEmail.trim().toLowerCase()
    if (!normalized || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setErrors({ email: '正しいメールアドレスを入力してください' })
      return
    }
    if (normalized === email.trim().toLowerCase()) {
      setErrors({ email: '現在と異なるメールアドレスを入力してください' })
      return
    }
    setBusy(true)
    setErrors({})
    const action = surface === 'vendor'
      ? requestVendorEmailChange
      : surface === 'console'
        ? requestConsoleEmailChange
        : requestAppEmailChange
    const result = await action(normalized)
    setRateLimited(!!result.rateLimited)
    setDebugLinks(result.debugLinks ?? null)
    setNotice('現在と新しいメールアドレスに確認リンクをお送りしました')
    setBusy(false)
    close()
  }

  return (
    <section style={{ margin: '18px 20px 14px' }} data-account-security={surface}>
      <h2 style={{ fontSize: '.78rem', fontWeight: 500, marginBottom: 8 }}>アカウント</h2>
      <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <SecurityRow label="パスワード" action="パスワードを変更" onClick={() => open('password')} />
        <SecurityRow label="メールアドレス" value={email} action="変更する" onClick={() => open('email')} last />
      </div>

      {mode === 'password' && (
        <div style={{ marginTop: 10, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, padding: 16 }}>
          <Field id={`${surface}-current-password`} label="現在のパスワード" type="password" value={current} onChange={setCurrent} error={errors.current} autoComplete="current-password" />
          <Field id={`${surface}-new-password`} label="新しいパスワード" type="password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
          <Field id={`${surface}-new-password-confirmation`} label="新しいパスワード（確認）" type="password" value={confirmation} onChange={setConfirmation} error={errors.confirmation} autoComplete="new-password" />
          <Actions busy={busy} onSubmit={submitPassword} onCancel={close} submitLabel="変更する" />
        </div>
      )}

      {mode === 'email' && (
        <div style={{ marginTop: 10, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, padding: 16 }}>
          <Field id={`${surface}-new-email`} label="新しいメールアドレス" type="email" value={nextEmail} onChange={setNextEmail} error={errors.email} autoComplete="email" />
          <Actions busy={busy} onSubmit={submitEmail} onCancel={close} submitLabel="確認メールを送る" />
        </div>
      )}

      {notice && (
        <p
          role="status"
          data-account-notice
          data-rate-limited={rateLimited ? 'true' : 'false'}
          style={{ margin: '9px 2px 0', fontSize: '.68rem', color: 'var(--green)' }}
        >
          {notice}
        </p>
      )}
      {debugLinks && (
        <div hidden data-email-change-debug>
          <a data-stage="current" href={debugLinks.current}>current</a>
          <a data-stage="new" href={debugLinks.next}>new</a>
        </div>
      )}
    </section>
  )
}

function SecurityRow({ label, value, action, onClick, last }: {
  label: string
  value?: string
  action: string
  onClick: () => void
  last?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', borderBottom: last ? 'none' : '0.5px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.73rem', color: 'var(--muted2)' }}>{label}</div>
        {value && <div style={{ fontSize: '.68rem', marginTop: 2, overflowWrap: 'anywhere' }}>{value}</div>}
      </div>
      <button type="button" onClick={onClick} style={{ flexShrink: 0, minHeight: 44, border: 'none', background: 'none', color: 'var(--c-blue)', fontFamily: 'inherit', fontSize: '.68rem', cursor: 'pointer', padding: '0 2px' }}>
        {action}
      </button>
    </div>
  )
}

function Field({ id, label, type, value, onChange, error, autoComplete }: {
  id: string
  label: string
  type: 'password' | 'email'
  value: string
  onChange: (value: string) => void
  error?: string
  autoComplete: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: '.65rem', color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        style={{ ...FIELD, borderColor: error ? 'var(--red)' : 'var(--line)' }}
      />
      {error && <p style={{ color: 'var(--red)', fontSize: '.64rem', margin: '4px 0 0' }}>{error}</p>}
    </div>
  )
}

function Actions({ busy, onSubmit, onCancel, submitLabel }: {
  busy: boolean
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
      <button type="button" disabled={busy} onClick={onSubmit} className="btn btn-p" style={{ width: '100%', minHeight: 44, justifyContent: 'center' }}>
        {busy ? '処理中…' : submitLabel}
      </button>
      <button type="button" disabled={busy} onClick={onCancel} className="btn btn-g" style={{ width: '100%', minHeight: 44, justifyContent: 'center' }}>
        キャンセル
      </button>
    </div>
  )
}
