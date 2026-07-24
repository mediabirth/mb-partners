'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BrandMark from '@/components/ui/BrandMark'
import { signInVendor } from '@/app/login/actions'

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
    const result = await signInVendor(email, password)
    setLoading(false)
    if (!result.ok) { setError('メールアドレスまたはパスワードが正しくありません。'); return }
    router.push('/vendor'); router.refresh()
  }

  // v2.2：三重オービット装飾・radial drift は撤去＝静かな単色の面。minHeight は 100dvh。
  return (
    <div className="mb-field-bg" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div className="mb-field-bg" style={{
        width: '100%',
        maxWidth: 430,
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
          <div style={{ marginBottom: 24 }}>
            <BrandMark size={50} />
          </div>

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <label htmlFor="password">パスワード</label>
                  <Link href="/vendor/forgot-password" style={{ color: 'var(--blue)', fontSize: '.68rem', fontWeight: 600 }}>
                    パスワードをお忘れですか？
                  </Link>
                </div>
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
