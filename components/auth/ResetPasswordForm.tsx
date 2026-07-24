'use client'

import { useEffect, useRef, useState } from 'react'
import PasswordResetShell, { BackToLogin } from './PasswordResetShell'
import type { PasswordResetActionResult } from '@/app/password-reset/actions'

type FieldErrors = { password?: string; confirmation?: string }

export default function ResetPasswordForm(props: {
  credential: { code?: string; tokenHash?: string }
  loginHref: string
  exchangeCode: (credential: { code?: string; tokenHash?: string }) => Promise<PasswordResetActionResult>
  updatePassword: (password: string, confirmation: string) => Promise<PasswordResetActionResult>
}) {
  const { code, tokenHash } = props.credential
  const { exchangeCode } = props
  const [stage, setStage] = useState<'checking' | 'ready' | 'invalid' | 'complete'>('checking')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const exchangeStarted = useRef(false)

  useEffect(() => {
    // React Strict Mode のeffect再実行で単回使用tokenを二重交換しない。
    if (exchangeStarted.current) return
    exchangeStarted.current = true
    let active = true
    exchangeCode({ code, tokenHash }).then(result => {
      if (active) setStage(result.ok ? 'ready' : 'invalid')
    })
    return () => { active = false }
  }, [code, tokenHash, exchangeCode])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const next: FieldErrors = {}
    if (password.length < 8) next.password = '8文字以上で入力してください'
    if (!confirmation) next.confirmation = '確認用パスワードを入力してください'
    else if (password !== confirmation) next.confirmation = 'パスワードが一致しません'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    const result = await props.updatePassword(password, confirmation)
    setSaving(false)
    if (result.ok) {
      setStage('complete')
      return
    }
    if (result.error === 'password-too-short') setErrors({ password: '8文字以上で入力してください' })
    else if (result.error === 'password-mismatch') setErrors({ confirmation: 'パスワードが一致しません' })
    else setErrors({ confirmation: '更新できませんでした。もう一度お試しください' })
  }

  return (
    <PasswordResetShell title="新しいパスワードを設定">
      {stage === 'checking' && <p role="status" style={{ margin: 0 }}>リンクを確認しています…</p>}
      {stage === 'invalid' && (
        <>
          <p role="alert" style={{ margin: 0, lineHeight: 1.7 }}>このリンクは使用できません。再設定用リンクをもう一度発行してください。</p>
          <BackToLogin href={props.loginHref} />
        </>
      )}
      {stage === 'complete' && (
        <>
          <p role="status" style={{ margin: 0, lineHeight: 1.7 }}>パスワードを更新しました。新しいパスワードでログインしてください。</p>
          <BackToLogin href={props.loginHref} />
        </>
      )}
      {stage === 'ready' && (
        <form onSubmit={submit}>
          <div className="fld">
            <label htmlFor="new-password">新しいパスワード</label>
            <input
              id="new-password"
              className="ui-field"
              type="password"
              value={password}
              onChange={event => { setPassword(event.target.value); setErrors(current => ({ ...current, password: undefined })) }}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              style={{ borderColor: errors.password ? 'var(--red)' : undefined }}
            />
            {errors.password && <p role="alert" style={{ color: 'var(--red)', fontSize: '.7rem', margin: '5px 0 0' }}>{errors.password}</p>}
          </div>
          <div className="fld">
            <label htmlFor="confirm-password">新しいパスワード（確認）</label>
            <input
              id="confirm-password"
              className="ui-field"
              type="password"
              value={confirmation}
              onChange={event => { setConfirmation(event.target.value); setErrors(current => ({ ...current, confirmation: undefined })) }}
              autoComplete="new-password"
              aria-invalid={!!errors.confirmation}
              style={{ borderColor: errors.confirmation ? 'var(--red)' : undefined }}
            />
            {errors.confirmation && <p role="alert" style={{ color: 'var(--red)', fontSize: '.7rem', margin: '5px 0 0' }}>{errors.confirmation}</p>}
          </div>
          <button
            type="submit"
            className="ui-btn ui-btn--primary ui-btn--lg"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={saving}
          >
            {saving ? '更新中…' : 'パスワードを更新'}
          </button>
        </form>
      )}
    </PasswordResetShell>
  )
}
