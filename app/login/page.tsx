'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BrandMark from '@/components/ui/BrandMark'
import { signInApp } from './actions'

// オープンリダイレクト防止：?redirect は /app 配下の相対パスのみ許可。外部URL/プロトコル相対/他サーフェス/制御文字は弾き '/' へ。
function safeRedirect(): string {
  try {
    if (typeof window === 'undefined') return '/'
    const raw = new URLSearchParams(window.location.search).get('redirect')
    if (!raw) return '/'
    if (raw.includes('\\')) return '/'
    for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); if (c < 32 || c === 127) return '/' }
    if (/^https?:/i.test(raw) || raw.startsWith('//')) return '/'
    if (raw === '/app' || raw.startsWith('/app/')) return raw
    return '/'
  } catch { return '/' }
}

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

    const result = await signInApp(email, password)

    setLoading(false)
    if (!result.ok) {
      setError('メールアドレスまたはパスワードが正しくありません。')
      return
    }
    // ?redirect があれば /app 配下のみ許可して復帰（ディープリンク）。無し/不正は '/'＝role判定で /app or /console（従来挙動）。
    router.push(safeRedirect())
    router.refresh() // flush server component cache
  }

  return (
    <div className="mb-field-bg" style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div className="mb-field-bg" style={{
        width: '100%',
        maxWidth: 430,
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
          <div style={{ marginBottom: 24, animation: 'up .5s .1s both' }}>
            <BrandMark size={50} />
          </div>

          <div className="eyebrow" style={{ animation: 'up .5s .18s both' }}>
            Media Birth Partner Program
          </div>

          <h1 style={{
            fontSize: '1.55rem', fontWeight: 900, lineHeight: 1.45,
            margin: '10px 0 26px', animation: 'up .5s .26s both',
          }}>
            あなたの紹介が、<br />
            <em style={{ fontStyle: 'normal', color: 'var(--blue)' }}>次の出会いをつくる。</em>
          </h1>

          <div className="ui-card" style={{ animation: 'up .5s .42s both', padding: 18 }}>
            <form onSubmit={handleSubmit}>
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
