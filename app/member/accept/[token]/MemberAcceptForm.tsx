'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MemberAcceptForm({ email, defaultName, token }: { email: string; defaultName: string; token: string }) {
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
    const res = await fetch('/api/member/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, name: name.trim(), password }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'アカウント作成に失敗しました'); setLoading(false); return }
    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) { setError('アカウントは作成されましたが、ログインに失敗しました。ログインページからお試しください。'); setLoading(false); return }
    router.push('/console'); router.refresh()
  }
  const input: React.CSSProperties = { width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.86rem', marginBottom: 14 }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 5 }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 90% at 85% 0%, var(--blue-bg2) 0%, var(--bg2) 55%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '100%', background: '#fff', border: '1px solid var(--line)', borderRadius: 18, padding: '34px 30px', boxShadow: '0 28px 80px rgba(14,14,20,.12)' }}>
        <svg width="40" height="40" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 14 }}>
          <g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" />
        </svg>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 4 }}>MBメンバー登録</h1>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', marginBottom: 20 }}>{email} 宛の招待です。パスワードを設定してください。</p>
        <form onSubmit={submit}>
          <label style={lbl}>お名前</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="例：田中 太郎" style={input} />
          <label style={lbl}>パスワード（8文字以上）</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={input} />
          <label style={lbl}>パスワード（確認）</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} style={{ ...input, marginBottom: 18 }} />
          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 14 }}>{error}</p>}
          <button type="submit" disabled={loading || !ready} className="btn btn-p" style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '.86rem', opacity: (loading || !ready) ? .6 : 1 }}>
            {loading ? '作成中…' : 'アカウントを作成してコンソールへ'}
          </button>
        </form>
      </div>
    </div>
  )
}
