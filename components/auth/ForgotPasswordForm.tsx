'use client'

import { useState } from 'react'
import PasswordResetShell, { BackToLogin } from './PasswordResetShell'
import type { PasswordResetRequestResult } from '@/app/password-reset/actions'

export default function ForgotPasswordForm(props: {
  loginHref: string
  requestReset: (email: string) => Promise<PasswordResetRequestResult>
}) {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<PasswordResetRequestResult | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim() || sending) return
    setSending(true)
    try {
      setResult(await props.requestReset(email))
    } finally {
      setSending(false)
    }
  }

  return (
    <PasswordResetShell title="パスワードを再設定">
      {result ? (
        <>
          <p role="status" style={{ margin: 0, fontSize: '.85rem', lineHeight: 1.8 }}>
            再設定用のリンクをお送りしました（登録がある場合）
          </p>
          <div
            data-testid="password-reset-result"
            data-rate-limited={result.rateLimited ? 'true' : 'false'}
            data-debug-link={result.debugLink ?? ''}
            hidden
          />
          <BackToLogin href={props.loginHref} />
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="fld">
            <label htmlFor="reset-email">メールアドレス</label>
            <input
              id="reset-email"
              className="ui-field"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="ui-btn ui-btn--primary ui-btn--lg"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={sending}
          >
            {sending ? '送信中…' : '再設定用リンクを送る'}
          </button>
          <BackToLogin href={props.loginHref} />
        </form>
      )}
    </PasswordResetShell>
  )
}
