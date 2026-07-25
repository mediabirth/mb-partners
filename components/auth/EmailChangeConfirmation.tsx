'use client'

import { useEffect, useRef, useState } from 'react'
import { confirmAppEmailChange, confirmVendorEmailChange } from '@/app/account-security/actions'

type State = 'checking' | 'pending' | 'completed' | 'invalid' | 'failed'

export default function EmailChangeConfirmation({ surface, loginHref }: {
  surface: 'app' | 'vendor'
  loginHref: string
}) {
  const started = useRef(false)
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash') ?? ''
    const action = surface === 'vendor' ? confirmVendorEmailChange : confirmAppEmailChange
    action(tokenHash).then(result => {
      if (!result.ok) {
        setState(result.error === 'invalid-link' ? 'invalid' : 'failed')
        return
      }
      setState(result.state === 'completed' ? 'completed' : 'pending')
    }).catch(() => setState('failed'))
  }, [surface])

  const content = {
    checking: ['確認しています', 'このままお待ちください'],
    pending: ['確認しました', 'もう一方のメールアドレスに届いたリンクも確認してください'],
    completed: ['メールアドレスを変更しました', '新しいメールアドレスでログインできます'],
    invalid: ['リンクを確認できませんでした', '有効期限が切れているか、すでに使用されています'],
    failed: ['変更を完了できませんでした', '時間をおいて再度お試しください'],
  }[state]

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg2)', padding: 20 }}>
      <section data-email-change-state={state} style={{ width: '100%', maxWidth: 420, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, padding: '28px 22px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.02rem', fontWeight: 700 }}>{content[0]}</h1>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.7, margin: '10px 0 20px' }}>{content[1]}</p>
        {state !== 'checking' && (
          <a href={loginHref} className="btn btn-p" style={{ minHeight: 44, justifyContent: 'center', textDecoration: 'none' }}>
            ログインへ
          </a>
        )}
      </section>
    </main>
  )
}
