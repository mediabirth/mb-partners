'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false, // 招待済みユーザーのみ
      },
    })

    setLoading(false)
    if (err) {
      setError('送信できませんでした。登録済みのメールアドレスをご確認ください。')
    } else {
      setSent(true)
    }
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

          {/* Eyebrow */}
          <div className="eyebrow" style={{ animation: 'up .5s .18s both' }}>
            Media Birth Partner Program
          </div>

          {/* Heading */}
          <h1 style={{
            fontSize: '1.55rem', fontWeight: 900, lineHeight: 1.45,
            margin: '10px 0', animation: 'up .5s .26s both',
          }}>
            つなぐだけでも、<br />
            売り切るまでも。<br />
            <em style={{ fontStyle: 'normal', color: 'var(--blue)' }}>選ぶのはあなた。</em>
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: '.75rem', color: 'var(--muted2)', lineHeight: 1.8,
            marginBottom: 26, animation: 'up .5s .34s both',
          }}>
            案件ごとに「関わり方」と報酬を選べる、<br />Media Birth公式パートナープログラム。
          </p>

          {/* Form */}
          <div style={{ animation: 'up .5s .42s both' }}>
            {!sent ? (
              <form onSubmit={handleSubmit}>
                <div className="fld">
                  <label htmlFor="email">登録メールアドレス</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
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
                  {loading ? '送信中…' : 'ログインリンクを送信'}
                </button>
              </form>
            ) : (
              <div style={{
                background: 'var(--blue-bg2)',
                border: '1px solid var(--blue-bg)',
                borderRadius: 12,
                padding: 16,
                fontSize: '.74rem',
                lineHeight: 1.7,
                textAlign: 'center',
                animation: 'up .35s both',
              }}>
                <b style={{ color: 'var(--blue)' }}>送信しました。</b>
                <br />
                メールのリンクからログインしてください。
                <br />
                <button
                  className="btn btn-g"
                  style={{ marginTop: 12, fontSize: '.72rem', padding: '9px 16px' }}
                  onClick={() => setSent(false)}
                >
                  別のアドレスで試す
                </button>
              </div>
            )}
          </div>

          {/* Note */}
          <p style={{
            fontSize: '.62rem', color: 'var(--muted)',
            marginTop: 16, textAlign: 'center',
          }}>
            本プログラムは招待制です。
          </p>
        </div>
      </div>
    </div>
  )
}
