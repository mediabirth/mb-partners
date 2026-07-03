'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VendorAcceptForm({ email, defaultName, token }: { email: string; defaultName: string; token: string }) {
  const router = useRouter()
  const [name, setName] = useState(defaultName)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const ready = !!name.trim() && password.length >= 8 && password === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) { setError(password.length < 8 ? 'パスワードは8文字以上で設定してください' : password !== confirm ? 'パスワードが一致しません' : 'お名前を入力してください'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/vendor/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, name: name.trim(), password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'アカウント作成に失敗しました'); setLoading(false); return }
    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) { setError('アカウントは作成されましたが、ログインに失敗しました。ログインページからお試しください。'); setLoading(false); return }
    router.push('/vendor'); router.refresh()
  }

  const input: React.CSSProperties = { width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.86rem', marginBottom: 14 }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }

  // v2.2：radial 背景は撤去＝静かな単色の面（APPログインと同等）。minHeight は 100dvh。
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 18, padding: '34px 30px' }}>
        <svg width="40" height="40" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 14 }}>
          <rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="2.6" />
          <rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="2.6" />
          <rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="2.6" />
          <rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6" />
        </svg>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 500, marginBottom: 4 }}>MB Partners デリバリー登録</h1>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', marginBottom: 20 }}>{email} 宛の招待です。パスワードを設定してください。</p>
        <form onSubmit={submit}>
          <label style={lbl}>お名前 / 屋号</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例: 田中フォト" style={input} />
          <label style={lbl}>パスワード（8文字以上）</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={input} />
          <label style={lbl}>パスワード（確認）</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={{ ...input, marginBottom: 18 }} />
          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 14 }}>{error}</p>}
          <button type="submit" disabled={loading || !ready} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }}>
            {loading ? '作成中…' : 'アカウントを作成してログイン'}
          </button>
        </form>
      </div>
    </div>
  )
}
