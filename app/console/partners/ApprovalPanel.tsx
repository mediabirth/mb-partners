'use client'
import { useState, useTransition } from 'react'
import type { PartnerRow } from '@/lib/supabase/queries'

export default function ApprovalPanel({ partners: initial }: { partners: PartnerRow[] }) {
  const [partners, setPartners] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function approve(id: string, name: string) {
    startTransition(async () => {
      const res = await fetch(`/api/console/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (res.ok) {
        setPartners(prev => prev.filter(p => p.id !== id))
        showToast(`${name} を承認しました`)
      }
    })
  }

  function reject(id: string, name: string) {
    if (!confirm(`「${name}」の申請を却下しますか?`)) return
    startTransition(async () => {
      const res = await fetch(`/api/console/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      })
      if (res.ok) {
        setPartners(prev => prev.filter(p => p.id !== id))
        showToast(`${name} の申請を却下しました`)
      }
    })
  }

  if (partners.length === 0) return null

  return (
    <>
      <div style={{ background: '#fff', border: '1.5px solid var(--amber)', borderRadius: 14, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber-bg)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <b style={{ fontSize: '.78rem', color: 'var(--amber)' }}>承認待ちパートナー {partners.length}名</b>
        </div>
        {partners.map((p, i) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, padding: '14px 18px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: p.profiles?.color ?? '#B9BAC4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, flexShrink: 0 }}>
              {(p.profiles?.name ?? p.code)[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b style={{ fontSize: '.82rem' }}>{p.profiles?.name ?? '—'}</b>
                <span style={{ fontFamily: 'Inter', fontSize: '.62rem', color: 'var(--muted2)' }}>{p.code}</span>
              </div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 3 }}>
                {p.profiles?.email} · {new Date(p.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' })} 申請
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => approve(p.id, p.profiles?.name ?? p.code)}
                disabled={pending}
                className="btn btn-p"
                style={{ fontSize: '.7rem', padding: '7px 14px' }}
              >
                承認
              </button>
              <button
                onClick={() => reject(p.id, p.profiles?.name ?? p.code)}
                disabled={pending}
                style={{ fontSize: '.7rem', color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
              >
                却下
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99, whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
