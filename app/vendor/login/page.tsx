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
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (signInError) { setError('メールアドレスまたはパスワードが正しくありません。'); setLoading(false); return }
    router.push('/vendor'); router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 90% at 85% 0%, var(--blue-bg2) 0%, var(--bg2) 55%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="ui-card" style={{ width: 402, maxWidth: '100%', background: 'var(--s-0)', borderRadius: 18, padding: '36px 32px 30px', boxShadow: '0 28px 80px rgba(14,14,20,.12)' }}>
        <svg width="44" height="44" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 14 }}>
          <rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="2.6" />
          <rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="2.6" />
          <rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="2.6" />
          <rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6" />
        </svg>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 4 }}>MB <span style={{ color: 'var(--blue)' }}>Partners</span></h1>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', marginBottom: 22 }}>デリバリー（業務委託先）ログイン</p>
        <form onSubmit={handleLogin}>
          <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 5 }}>メールアドレス</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="ui-field" style={{ fontSize: '.86rem', marginBottom: 14 }} />
          <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 5 }}>パスワード</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            className="ui-field" style={{ fontSize: '.86rem', marginBottom: 18 }} />
          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 14 }}>{error}</p>}
          <button type="submit" disabled={loading} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
