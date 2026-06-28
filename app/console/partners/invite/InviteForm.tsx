'use client'
import { useState } from 'react'

type Kind = 'partner' | 'frontier' | 'delivery'
const KINDS: { id: Kind; label: string; note: string }[] = [
  { id: 'partner', label: 'パートナー', note: '' },
  { id: 'frontier', label: 'フロンティア', note: '' },
  { id: 'delivery', label: 'デリバリー', note: '' },
]

export default function InviteForm() {
  const [kind, setKind] = useState<Kind>(() => {
    if (typeof window !== 'undefined') { const k = new URLSearchParams(window.location.search).get('kind'); if (k === 'frontier' || k === 'delivery' || k === 'partner') return k }
    return 'partner'
  })
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const shareUrl = inviteUrl ? (kind === 'frontier' ? `${inviteUrl}?role=frontier` : inviteUrl) : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setInviteUrl('')
    try {
      if (kind === 'delivery') {
        if (!name.trim()) { setError('デリバリーは名称（屋号）が必須です'); setLoading(false); return }
        const dr = await fetch('/api/console/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), contact_email: email.trim() }) })
        const dd = await dr.json().catch(() => ({}))
        if (!dr.ok || !dd.delivery) { setError(dd.error || 'デリバリーの作成に失敗しました'); setLoading(false); return }
        const ir = await fetch(`/api/console/deliveries/${dd.delivery.id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
        const id = await ir.json().catch(() => ({}))
        if (!ir.ok || !id.invite_url) { setError(id.error || '招待リンクの発行に失敗しました'); setLoading(false); return }
        setInviteUrl(id.invite_url); setName('')
      } else {
        const res = await fetch('/api/console/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role: 'partner' }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data.error || 'エラーが発生しました'); setLoading(false); return }
        setInviteUrl(data.invite_url); setName('')
      }
      setEmail('')
    } catch { setError('エラーが発生しました') } finally { setLoading(false) }
  }
  async function handleCopy() { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const cur = KINDS.find(k => k.id === kind)!

  return (
    <div style={{ padding: '24px 28px', maxWidth: 560 }}>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '24px 24px' }}>
        <h2 style={{ fontSize: '.88rem', fontWeight: 800, marginBottom: 18 }}>招待する</h2>

        <form onSubmit={handleSubmit}>
          {/* ロール選択（統一導線） */}
          <div className="fld" style={{ marginBottom: 14 }}>
            <label>ロール</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {KINDS.map(k => (
                <button type="button" key={k.id} onClick={() => { setKind(k.id); setInviteUrl('') }}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${kind === k.id ? 'var(--blue)' : 'var(--line)'}`,
                    background: kind === k.id ? 'var(--blue)' : '#fff', color: kind === k.id ? '#fff' : 'var(--txt)' }}>
                  {k.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 6 }}>{cur.note}</p>
          </div>

          <div className="fld" style={{ marginBottom: 14 }}>
            <label htmlFor="inv-email">メールアドレス <span style={{ color: 'var(--red)' }}>*</span></label>
            <input id="inv-email" type="email" placeholder="partner@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="fld" style={{ marginBottom: 14 }}>
            <label htmlFor="inv-name">{kind === 'delivery' ? '名称 / 屋号' : 'お名前（任意・フォームに事前入力）'} {kind === 'delivery' && <span style={{ color: 'var(--red)' }}>*</span>}</label>
            <input id="inv-name" type="text" placeholder={kind === 'delivery' ? '例: 田中フォト' : '山田 太郎'} value={name} onChange={e => setName(e.target.value)} />
          </div>

          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

          <button type="submit" className="btn btn-p" style={{ justifyContent: 'center' }} disabled={loading || !email.trim() || (kind === 'delivery' && !name.trim())}>
            {loading ? '作成中…' : '招待リンクを作成'}
          </button>
        </form>

        {inviteUrl && (
          <div style={{ marginTop: 24, padding: 16, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10 }}>
            <p style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>{cur.label}の招待リンクが作成されました（有効期限: 7日間）</p>
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 7, padding: '10px 12px', fontSize: '.68rem', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 10, color: 'var(--txt)' }}>{shareUrl}</div>
            <button className="btn btn-g" style={{ fontSize: '.72rem', padding: '8px 16px' }} onClick={handleCopy}>{copied ? 'コピーしました ✓' : 'リンクをコピー'}</button>
            <p style={{ fontSize: '.65rem', color: 'var(--muted2)', marginTop: 10, lineHeight: 1.6 }}>このリンクを直接共有してください（メール送信は行いません）。</p>
          </div>
        )}
      </div>
    </div>
  )
}
