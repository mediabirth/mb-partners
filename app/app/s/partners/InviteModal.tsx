'use client'
/** 招待モーダル v8（コンソールの昇格モーダルと同文法・topbarの控えめなボタンから開く）。 */
import { useState } from 'react'
import { createPortal } from 'react-dom'

export default function InviteModal({ mode }: { mode: 'partner' | 'delivery' }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [work, setWork] = useState('')
  const [email, setEmail] = useState('')
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const isP = mode === 'partner'

  async function create() {
    if (busy) return
    if (!isP && !name.trim()) { setNote('委託先の名称は必須です'); return }
    setBusy(true); setNote('')
    try {
      const r = isP
        ? await fetch('/api/app/frontier/invite', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(email.trim() ? { email: email.trim() } : {}) })
        : await fetch('/api/supplier/self', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'invite_delivery', name: name.trim(), work: work.trim(), email: email.trim() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.invite_url) { setNote(j.error ?? '作成できませんでした'); return }
      setUrl(j.invite_url)
      await navigator.clipboard?.writeText(j.invite_url).catch(() => {})
      setCopied(true); setTimeout(() => setCopied(false), 2400)
      setNote(email.trim() ? (j.emailed ? '招待メールを送信し、リンクをコピーしました' : 'リンクをコピーしました（メールは送信できませんでした）') : 'リンクをコピーしました。相手に共有してください')
    } finally { setBusy(false) }
  }
  function close() { setOpen(false); setUrl(''); setNote(''); setName(''); setWork(''); setEmail('') }

  const FLD: React.CSSProperties = { width: '100%', border: '0.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.82rem', boxSizing: 'border-box' }
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.03em', display: 'block', marginBottom: 5 }

  return (
    <>
      <button onClick={() => setOpen(true)} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '8px 16px' }}>
        ＋ {isP ? 'パートナーを招待' : '委託先を招待'}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(14,14,20,.3)' }} />
          <div className="modal-pop" style={{ position: 'relative', width: 440, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
            <b style={{ fontSize: '.9rem', fontWeight: 500 }}>{isP ? 'パートナーを招待' : '委託先を招待'}</b>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '6px 0 14px', lineHeight: 1.7 }}>
              {isP ? 'リンクを共有するだけ。登録した方があなたのパートナーになります。' : '実務を担う委託先を招待します。登録後、案件から委託（アサイン）できます。'}
            </p>
            {!isP && (
              <>
                <label style={LBL}>名称 / 屋号 <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="例：山田保険事務所" style={{ ...FLD, marginBottom: 12 }} />
                <label style={LBL}>業務（任意）</label>
                <input value={work} onChange={e => setWork(e.target.value)} placeholder="例：保険の実務" style={{ ...FLD, marginBottom: 12 }} />
              </>
            )}
            <label style={LBL}>メールアドレス（任意・入力すると招待メールも送信）</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="taro@example.com" style={{ ...FLD, marginBottom: 16 }} />
            {url && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <input readOnly value={url} style={{ ...FLD, flex: 1, minWidth: 0, fontFamily: 'Inter', fontSize: '.66rem', color: 'var(--muted2)' }} />
                <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }} className="ui-btn ui-btn--ghost" style={{ fontSize: '.66rem', padding: '8px 12px', flexShrink: 0 }}>{copied ? '✓' : 'コピー'}</button>
              </div>
            )}
            {note && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '0 0 12px' }}>{note}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={close} className="ui-btn ui-btn--ghost" style={{ fontSize: '.72rem', padding: '8px 14px' }}>閉じる</button>
              <button onClick={create} disabled={busy || (!isP && !name.trim())} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '8px 16px' }}>
                {busy ? '作成中…' : copied ? 'コピーしました ✓' : url ? 'もう一度作成' : '招待リンクを作成'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
