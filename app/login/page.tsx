'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    })

    setLoading(false)
    if (err) {
      setError('メールアドレスまたはパスワードが正しくありません。')
      return
    }
    // Redirect to root — root page routes to /app or /console based on role.
    // This prevents admins (who have no partner record) from looping at /app.
    router.push('/')
    router.refresh() // flush server component cache
  }

  return (
    <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%',
        maxWidth: 430,
        background: '#fff',
        minHeight: '100vh',
        position: 'relative',
        boxShadow: '0 0 48px rgba(14,14,20,.12)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 28px',
        overflow: 'hidden',
      }}>

        {/* Orbit animation (top-right) */}
        <div style={{
          position: 'absolute', right: -110, top: -110,
          width: 340, height: 340, pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            border: '1.5px solid #EDEBFC', borderRadius: '50%',
            animation: 'spin 50s linear infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 46,
            border: '1.5px solid #DCD8FA', borderRadius: '50%',
            animation: 'spin 34s linear infinite reverse',
          }} />
          <div style={{
            position: 'absolute', inset: 104,
            border: '1.5px solid #4733E6', borderRadius: '50%',
            opacity: .25, animation: 'spin 22s linear infinite',
          }} />
        </div>

        {/* Background gradient */}
        <div style={{
          position: 'absolute', inset: '-30%', pointerEvents: 'none',
          background: 'radial-gradient(46% 36% at 72% 18%,#EDEBFC,transparent 70%)',
          animation: 'drift 16s ease-in-out infinite alternate',
        }} />

        {/* Content */}
        <div style={{ position: 'relative' }}>
          {/* Logo mark */}
          <svg
            width="50" height="50" viewBox="0 0 48 48" fill="none"
            style={{ marginBottom: 24, animation: 'up .5s .1s both' }}
          >
            <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="2.6"/>
            <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="2.6"/>
            <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="2.6"/>
            <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
          </svg>

          <div className="eyebrow" style={{ animation: 'up .5s .18s both' }}>
            Media Birth Partner Program
          </div>

          <h1 style={{
            fontSize: '1.55rem', fontWeight: 900, lineHeight: 1.45,
            margin: '10px 0', animation: 'up .5s .26s both',
          }}>
            あなたの紹介が、<br />
            <em style={{ fontStyle: 'normal', color: 'var(--blue)' }}>次の出会いをつくる。</em>
          </h1>

          <p style={{
            fontSize: '.78rem', color: 'var(--muted2)', lineHeight: 1.8,
            marginBottom: 26, animation: 'up .5s .34s both',
          }}>
            ご縁を、成果に。
          </p>

          <div style={{ animation: 'up .5s .42s both' }}>
            <form onSubmit={handleSubmit}>
              <div className="fld">
                <label htmlFor="email">メールアドレス</label>
                <input
                  id="email"
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
                className="btn btn-p"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? 'ログイン中…' : 'ログイン'}
              </button>
            </form>
          </div>

          <p style={{
            fontSize: '.62rem', color: 'var(--muted)',
            marginTop: 16, textAlign: 'center',
          }}>
            本プログラムは招待制です。パスワードは招待時に設定します。
          </p>
        </div>
      </div>
    </div>
  )
}
