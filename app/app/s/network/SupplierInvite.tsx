'use client'
/** 網v2 招待（§3・システム全体で唯一のフォーム）: 「リンクをコピー」主体・メール招待は副。 */
import { useState } from 'react'

export default function SupplierInvite() {
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')

  async function createLink(withEmail?: string) {
    if (busy) return
    setBusy(true); setNote('')
    try {
      const r = await fetch('/api/app/frontier/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(withEmail ? { email: withEmail } : {}) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.invite_url) { setNote(j.error ?? '作成できませんでした。時間をおいてお試しください'); return }
      setUrl(j.invite_url)
      if (withEmail) { setNote(j.emailed ? '招待メールを送信しました（リンクの共有も可能です）' : 'リンクを作成しました（メールは送信できませんでした）'); setEmail('') }
      else {
        await navigator.clipboard?.writeText(j.invite_url).catch(() => {})
        setCopied(true); setTimeout(() => setCopied(false), 2200)
      }
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, padding: '14px 16px' }}>
      <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: 3 }}>リファラルを招待</div>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', margin: '0 0 10px', lineHeight: 1.7 }}>リンクを共有するだけ。登録した方があなたの網に入ります。</p>
      <button onClick={() => createLink()} disabled={busy}
        style={{ width: '100%', minHeight: 44, fontFamily: 'inherit', fontSize: '.78rem', fontWeight: 700, color: '#fff', background: 'var(--c-blue)', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
        {busy ? '作成中…' : copied ? 'コピーしました ✓' : '招待リンクを作成してコピー'}
      </button>
      {url && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <input readOnly value={url} style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '0.5px solid var(--line)', fontSize: '.66rem', fontFamily: 'Inter', color: 'var(--muted2)' }} />
          <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2200) }}
            style={{ flexShrink: 0, fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 500, minHeight: 36, padding: '0 12px', borderRadius: 8, border: '0.5px solid var(--line)', background: '#fff', cursor: 'pointer' }}>コピー</button>
        </div>
      )}
      <button onClick={() => setMailOpen(v => !v)} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.64rem', color: 'var(--c-blue)', padding: 0 }}>
        {mailOpen ? '− メールでの招待を閉じる' : '＋ メールで招待する（任意）'}
      </button>
      {mailOpen && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="招待する方のメール"
            style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '0 10px', borderRadius: 8, border: '0.5px solid var(--line)', fontSize: '.74rem', fontFamily: 'inherit' }} />
          <button onClick={() => email.trim() && createLink(email.trim())} disabled={busy || !email.trim()}
            style={{ flexShrink: 0, fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 500, minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--blue-bg2)', color: 'var(--c-blue)', cursor: 'pointer' }}>送信</button>
        </div>
      )}
      {note && <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '8px 0 0' }}>{note}</p>}
    </div>
  )
}
