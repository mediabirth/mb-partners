'use client'
import { useState } from 'react'
import Link from 'next/link'

const CATS = [
  { value: 'payout', label: '委託費について' },
  { value: 'case', label: '案件について' },
  { value: 'account', label: 'アカウントについて' },
  { value: 'other', label: 'その他' },
]

export default function VendorSupport() {
  const [category, setCategory] = useState('other')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!body.trim()) { setError('お問い合わせ内容を入力してください'); return }
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/vendor/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, subject: subject.trim(), body: body.trim() }) })
      if (r.ok) setSent(true)
      else { const d = await r.json().catch(() => ({})); setError(d?.error ?? '送信に失敗しました') }
    } catch { setError('送信に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div className="page-anim">
      <div style={{ padding: '12px 20px 0' }}>
        <Link href="/vendor/settings" style={{ fontSize: '.7rem', color: 'var(--muted2)', textDecoration: 'none' }}>← 設定</Link>
      </div>
      <div style={{ padding: '10px 20px 6px' }}>
        <h1 style={{ fontSize: '1.06rem', fontWeight: 500, letterSpacing: '-.01em' }}>お問い合わせ</h1>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>委託費・案件・アカウントなど、お困りごとを運営にお送りください。</p>
      </div>

      {sent ? (
        <div style={{ margin: '14px 20px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div style={{ fontSize: '.82rem', fontWeight: 500 }}>送信しました</div>
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>運営が内容を確認し、ご登録の連絡先へ返信します。</p>
          <Link href="/vendor" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none', marginTop: 16 }}>ホームに戻る</Link>
        </div>
      ) : (
        <div style={{ padding: '8px 20px 28px' }}>
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px' }}>
            <label style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 7 }}>カテゴリ</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {CATS.map(c => {
                const on = category === c.value
                return (
                  <button key={c.value} type="button" onClick={() => setCategory(c.value)} style={{ padding: '7px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: on ? 500 : 400, background: on ? 'var(--c-blue)' : 'var(--bg2)', color: on ? '#fff' : 'var(--muted2)' }}>{c.label}</button>
                )
              })}
            </div>
            <label style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>件名（任意）</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="例：委託費の振込日について" style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.78rem', marginBottom: 14, boxSizing: 'border-box' }} />
            <label style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>お問い合わせ内容</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="お困りごとの内容をご記入ください。" style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, padding: '11px 12px', fontFamily: 'inherit', fontSize: '.78rem', resize: 'vertical', boxSizing: 'border-box' }} />
            {error && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '10px 0 0' }}>{error}</p>}
          </div>
          <button onClick={submit} disabled={busy || !body.trim()} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', justifyContent: 'center', marginTop: 14, ...((busy || !body.trim()) ? { opacity: .5 } : {}) }}>{busy ? '送信中…' : '送信する'}</button>
        </div>
      )}
    </div>
  )
}
