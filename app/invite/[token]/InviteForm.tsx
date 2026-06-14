'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function InviteForm({
  email,
  defaultName,
  token,
}: {
  email: string
  defaultName: string
  token: string
}) {
  const router = useRouter()
  const [name, setName]                 = useState(defaultName)
  const [password, setPassword]         = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [done, setDone]                 = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim())    { setError('お名前を入力してください'); return }
    if (password.length < 8) { setError('パスワードは8文字以上で設定してください'); return }
    if (password !== passwordConfirm) { setError('パスワードが一致しません'); return }

    setLoading(true)

    // Step 1: Server creates the user account + partner record
    const res = await fetch('/api/invite/accept', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, name: name.trim(), email, password }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'アカウント作成に失敗しました')
      setLoading(false)
      return
    }

    // Step 2: Client signs in with the new credentials (password path — no magic link)
    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })

    if (signInErr) {
      setError('アカウントは作成されましたが、ログインに失敗しました。ログインページからサインインしてください。')
      setLoading(false)
      return
    }

    // Step 3: Show success screen, then navigate
    setDone(true)
    setTimeout(() => { router.push('/app'); router.refresh() }, 2200)
  }

  return (
    <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 430, background: '#fff', minHeight: '100vh',
        boxShadow: '0 0 48px rgba(14,14,20,.12)', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '40px 28px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Background gradient */}
        <div style={{
          position: 'absolute', inset: '-30%', pointerEvents: 'none',
          background: 'radial-gradient(46% 36% at 72% 18%,#EDEBFC,transparent 70%)',
        }} />

        {done && (
          <div style={{ position: 'relative', textAlign: 'center', padding: '32px 0' }}>
            <style>{`@keyframes drawCheck { from { stroke-dashoffset: 52 } to { stroke-dashoffset: 0 } }`}</style>
            <svg width="96" height="96" viewBox="0 0 100 100" style={{ margin: '0 auto 20px', display: 'block' }}>
              <circle
                cx="50" cy="50" r="45"
                fill="none" stroke="var(--blue)" strokeWidth="3"
                className="draw"
              />
              <path
                d="M30 51l14 14 26-26"
                fill="none" stroke="var(--blue)" strokeWidth="3.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{
                  strokeDasharray: 52,
                  strokeDashoffset: 52,
                  animation: 'drawCheck .4s cubic-bezier(.2,.8,.2,1) .6s both',
                }}
              />
            </svg>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 8 }}>アカウント作成完了！</h2>
            <p style={{ fontSize: '.75rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
              パートナーポータルへ移動します…
            </p>
          </div>
        )}

        <div style={{ position: 'relative', display: done ? 'none' : undefined }}>
          {/* Logo */}
          <svg width="50" height="50" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 24 }}>
            <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="2.6"/>
            <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="2.6"/>
            <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="2.6"/>
            <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
          </svg>

          <div className="eyebrow">Media Birth Partner Program</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, lineHeight: 1.45, margin: '10px 0 8px' }}>
            招待を受け取りました
          </h1>
          <p style={{ fontSize: '.75rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 28 }}>
            パスワードを設定してアカウントを作成します。
          </p>

          <form onSubmit={handleSubmit}>
            {/* Email — readonly prefill */}
            <div className="fld" style={{ marginBottom: 14 }}>
              <label>メールアドレス</label>
              <input
                type="email"
                value={email}
                readOnly
                style={{ background: 'var(--bg2)', color: 'var(--muted2)', cursor: 'default' }}
              />
            </div>

            {/* Name */}
            <div className="fld" style={{ marginBottom: 14 }}>
              <label htmlFor="invite-name">お名前 <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="invite-name"
                type="text"
                placeholder="例: 山田 太郎"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus={!defaultName}
              />
            </div>

            {/* Password */}
            <div className="fld" style={{ marginBottom: 14 }}>
              <label htmlFor="invite-pw">パスワード <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="invite-pw"
                type="password"
                placeholder="8文字以上"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                autoFocus={!!defaultName}
              />
            </div>

            {/* Password confirm */}
            <div className="fld" style={{ marginBottom: 20 }}>
              <label htmlFor="invite-pw2">パスワード（確認） <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="invite-pw2"
                type="password"
                placeholder="もう一度入力"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 12 }}>{error}</p>
            )}

            <button
              type="submit"
              className="btn btn-p"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading || !name.trim() || password.length < 8 || password !== passwordConfirm}
            >
              {loading ? 'アカウント作成中…' : 'アカウントを作成してログイン'}
            </button>
          </form>

          <p style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 16, textAlign: 'center' }}>
            すでにアカウントをお持ちの方は<a href="/login" style={{ color: 'var(--blue)' }}>ログイン</a>へ
          </p>
        </div>
      </div>
    </div>
  )
}
