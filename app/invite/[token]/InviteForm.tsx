'use client'

import { useState } from 'react'

export default function InviteForm({
  email,
  defaultName,
  token,
}: {
  email: string
  defaultName: string
  token: string
}) {
  const [name, setName]       = useState(defaultName)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/invite/accept', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, name: name.trim() }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'エラーが発生しました')
      setLoading(false)
      return
    }

    // Supabase verify → /auth/magic#access_token=... → セッション確立 → /app
    window.location.href = data.action_link
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

        <div style={{ position: 'relative' }}>
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
            アカウントを作成してパートナープログラムに参加してください。
          </p>

          <form onSubmit={handleSubmit}>
            <div className="fld" style={{ marginBottom: 14 }}>
              <label>メールアドレス</label>
              <input
                type="email"
                value={email}
                readOnly
                style={{ background: 'var(--bg2)', color: 'var(--muted2)', cursor: 'default' }}
              />
            </div>
            <div className="fld" style={{ marginBottom: 20 }}>
              <label htmlFor="invite-name">お名前</label>
              <input
                id="invite-name"
                type="text"
                placeholder="例: 山田 太郎"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            {error && (
              <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 12 }}>{error}</p>
            )}

            <button
              type="submit"
              className="btn btn-p"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading || !name.trim()}
            >
              {loading ? 'アカウント作成中…' : 'アカウントを作成してログイン'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
