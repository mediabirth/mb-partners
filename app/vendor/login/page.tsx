'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VendorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setLoading(false)
    if (signInError) { setError('メールアドレスまたはパスワードが正しくありません。'); return }
    router.push('/vendor'); router.refresh()
  }

  // v2.2：三重オービット装飾・radial drift は撤去＝静かな単色の面。minHeight は 100dvh。
  return (
    <div style={{ background: '#E9E9ED', minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%',
        maxWidth: 430,
        background: '#fff',
        minHeight: '100dvh',
        position: 'relative',
        boxShadow: '0 0 48px rgba(14,14,20,.12)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 28px',
        overflow: 'hidden',
      }}>

        {/* Content */}
        <div style={{ position: 'relative' }}>
          {/* Logo mark */}
          <svg width="50" height="50" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 24 }}>
            <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="2.6"/>
            <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="2.6"/>
            <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="2.6"/>
            <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
          </svg>

          <div className="eyebrow">
            Media Birth Partner Program
          </div>

          <h1 style={{
            fontSize: '1.55rem', fontWeight: 500, lineHeight: 1.45,
            margin: '10px 0 26px',
          }}>
            あなたの成果を、<br />
            <em style={{ fontStyle: 'normal', color: 'var(--blue)' }}>もっと見やすく</em>
          </h1>

          <div className="ui-card" style={{ padding: 18 }}>
            <form onSubmit={handleLogin}>
              <div className="fld">
                <label htmlFor="email">メールアドレス</label>
                <input
                  id="email"
                  className="ui-field"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className="fld">
                <label htmlFor="password">パスワード</label>
                <input
                  id="password"
                  className="ui-field"
                  type="password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 10 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="ui-btn ui-btn--primary ui-btn--lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                disabled={loading}
              >
                {loading ? 'ログイン中…' : 'ログイン'}
              </button>
            </form>
          </div>

          <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 16, textAlign: 'center' }}>
            本プログラムは招待制です。パスワードは招待時に設定します。
          </p>
        </div>
      </div>
    </div>
  )
}
