'use client'
import { useState } from 'react'
import PageGuide from '@/components/PageGuide'
import ActionPending, { type ActionPendingState } from '@/components/ActionPending'

const FRONTIER_INVITE_GUIDE = {
  title: 'チーム招待について',
  lead: '招待した方が登録すると、あなたのチームに紐づきます。',
  sections: [
    { h: '条件', items: [
      { b: '対象期間', t: '登録から12ヶ月間、チームからの還元対象です' },
      { b: '還元', t: '対象の方の成果に応じて、あなたへの還元が記録されます。確定済みの報酬には影響しません' },
    ] },
  ],
}

// フロンティアのチーム招待リンク発行（?f=自分 で自動紐づけ）
export default function FrontierInvite() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [emailed, setEmailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actionState, setActionState] = useState<ActionPendingState>('idle')
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  async function create() {
    setLoading(true); setActionState('pending'); setErr(''); setUrl('')
    try {
      const r = await fetch('/api/app/frontier/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || '発行に失敗しました'); setActionState('idle'); return }
      setUrl(d.invite_url); setEmailed(!!d.emailed); setEmail(''); setName('')
      setActionState('success')
      await new Promise(resolve => setTimeout(resolve, 320))
      setActionState('idle')
    } catch { setErr('発行に失敗しました'); setActionState('idle') } finally { setLoading(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}><b style={{ fontSize: '.82rem' }}>パートナーを招待</b><PageGuide data={FRONTIER_INVITE_GUIDE} /></span>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>このリンクから登録した方はあなたのチームに自動で紐づきます（12ヶ月間、チームからの還元対象）。</p>
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
        <ActionPending state={actionState} idleLabel="招待リンクを発行" pendingLabel="招待を準備しています…" successLabel="作成しました" />
      </button>
      {url && (
        <div style={{ marginTop: 12, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10, padding: 12 }}>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 7, padding: '9px 10px', fontSize: '.62rem', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 8 }}>{url}</div>
          <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }} className="btn btn-g" style={{ fontSize: '.72rem', padding: '8px 16px' }}>
            {copied ? 'コピーしました' : 'リンクをコピー'}
          </button>
          <p style={{ fontSize: '.6rem', color: 'var(--muted2)', margin: '8px 2px 0', lineHeight: 1.6 }}>
            {emailed ? '招待メールを送信しました。リンクの共有も可能です。' : 'メールを送信できませんでした。このリンクを共有してください。'}
          </p>
          <p style={{ fontSize: '.6rem', color: 'var(--muted)', margin: '4px 2px 0' }}>招待リンクの有効期限は7日です。</p>
        </div>
      )}
    </div>
  )
}
