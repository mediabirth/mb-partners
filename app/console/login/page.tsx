'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/ui/BrandMark'
import { signInConsole } from '@/app/login/actions'

export default function ConsoleLoginPage() {
  const router = useRouter()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // メール＋パスワードのみ（2FAは撤去）
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signInConsole(email, password)
    if (!result.ok) {
      setError('メールアドレスまたはパスワードが正しくありません。')
      setLoading(false)
      return
    }
    router.push('/console')
    router.refresh()
  }

  /* ---- UI ---- */
  return (
    <div className="mb-field-bg" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Orbit rings — top-right corner */}
      <div style={{ position: 'absolute', right: -110, top: -110, width: 340, height: 340, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, border: '1.5px solid #EDEBFC', borderRadius: '50%', animation: 'spin 50s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 46, border: '1.5px solid #DCD8FA', borderRadius: '50%', animation: 'spin 34s linear infinite reverse' }} />
        <div style={{ position: 'absolute', inset: 104, border: '1.5px solid #4733E6', borderRadius: '50%', opacity: .22, animation: 'spin 22s linear infinite' }} />
      </div>
      <div className="ui-card" style={{
        width: 402, maxWidth: '100%',
        background: 'var(--s-0)',
        borderRadius: 18,
        padding: '36px 32px 30px',
        boxShadow: '0 28px 80px rgba(14,14,20,.12)',
      }}>
        {/* Logo */}
        <BrandMark size={44} />

        <h2 style={{ fontSize: '1.1rem', fontWeight: 500, margin: '14px 0 4px', letterSpacing: '-.012em' }}>
          MB Partners <span style={{ color: 'var(--blue)' }}>Console</span>
        </h2>

        <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 20 }}>
          管理者アカウントでログインしてください。すべての操作は監査ログに記録されます。
        </p>
        <form onSubmit={handleLogin}>
          <div className="fld">
            <label>メールアドレス</label>
            <input
              className="ui-field"
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com" required autoComplete="email"
            />
          </div>
          <div className="fld">
            <label>パスワード</label>
            <input
              className="ui-field"
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••" required autoComplete="current-password"
            />
          </div>
          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <p style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 18, textAlign: 'center', borderTop: '0.5px solid var(--line)', paddingTop: 14 }}>
          管理者の追加は招待制（オーナーのみ）。パートナーの方は<br />
          パートナーポータルからログインしてください。
        </p>
      </div>
    </div>
  )
}
