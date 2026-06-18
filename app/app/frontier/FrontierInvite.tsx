'use client'
import { useState } from 'react'

// フロンティアのチーム招待リンク発行（?f=自分 で自動紐づけ）
export default function FrontierInvite() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  async function create() {
    setLoading(true); setErr(''); setUrl('')
    try {
      const r = await fetch('/api/app/frontier/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || '発行に失敗しました'); return }
      setUrl(d.invite_url); setEmail(''); setName('')
    } catch { setErr('発行に失敗しました') } finally { setLoading(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
      <b style={{ fontSize: '.82rem', display: 'block', marginBottom: 4 }}>パートナーを招待</b>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>このリンクから登録した方はあなたのチームに自動で紐づきます（12ヶ月間オーバーライド対象）。</p>
      <div className="fld" style={{ marginBottom: 8 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="招待する方のメール" type="email"
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.82rem' }} />
      </div>
      <div className="fld" style={{ marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="お名前（任意）"
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.82rem' }} />
      </div>
      {err && <p style={{ fontSize: '.68rem', color: 'var(--red)', marginBottom: 8 }}>{err}</p>}
      <button onClick={create} disabled={loading || !email.trim()} className="btn btn-p lift" style={{ width: '100%', opacity: (loading || !email.trim()) ? .5 : 1 }}>
        {loading ? '発行中…' : '招待リンクを発行'}
      </button>
      {url && (
        <div style={{ marginTop: 12, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: 12 }}>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 7, padding: '9px 10px', fontSize: '.62rem', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 8 }}>{url}</div>
          <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }} className="btn btn-g" style={{ fontSize: '.72rem', padding: '8px 16px' }}>
            {copied ? 'コピーしました ✓' : 'リンクをコピー'}
          </button>
        </div>
      )}
    </div>
  )
}
