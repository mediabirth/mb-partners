'use client'

import { useState } from 'react'

export default function InviteForm() {
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [role, setRole]     = useState('partner')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setInviteUrl('')

    const res = await fetch('/api/console/invites', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'エラーが発生しました')
      return
    }

    setInviteUrl(data.invite_url)
    setEmail('')
    setName('')
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 560 }}>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '24px 24px' }}>
        <h2 style={{ fontSize: '.88rem', fontWeight: 800, marginBottom: 20 }}>新規招待を作成</h2>

        <form onSubmit={handleSubmit}>
          <div className="fld" style={{ marginBottom: 14 }}>
            <label htmlFor="inv-email">メールアドレス <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              id="inv-email"
              type="email"
              placeholder="partner@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="fld" style={{ marginBottom: 14 }}>
            <label htmlFor="inv-name">お名前（任意・フォームに事前入力されます）</label>
            <input
              id="inv-name"
              type="text"
              placeholder="山田 太郎"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>


          {error && (
            <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 12 }}>{error}</p>
          )}

          <button
            type="submit"
            className="btn btn-p"
            style={{ justifyContent: 'center' }}
            disabled={loading || !email.trim()}
          >
            {loading ? '作成中…' : '招待リンクを作成'}
          </button>
        </form>

        {inviteUrl && (
          <div style={{
            marginTop: 24, padding: 16,
            background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)',
            borderRadius: 10,
          }}>
            <p style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>
              招待リンクが作成されました（有効期限: 7日間）
            </p>
            <div style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 7,
              padding: '10px 12px', fontSize: '.68rem', fontFamily: 'monospace',
              wordBreak: 'break-all', marginBottom: 10, color: 'var(--text)',
            }}>
              {inviteUrl}
            </div>
            <button
              className="btn btn-g"
              style={{ fontSize: '.72rem', padding: '8px 16px' }}
              onClick={handleCopy}
            >
              {copied ? 'コピーしました ✓' : 'リンクをコピー'}
            </button>
            <p style={{ fontSize: '.65rem', color: 'var(--muted2)', marginTop: 10, lineHeight: 1.6 }}>
              このリンクを招待者に直接共有してください（メール送信は行いません）。
              <br />招待者がリンクを開くと名前を入力してアカウントを作成できます。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
