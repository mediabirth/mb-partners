'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Status = 'active' | 'pending' | 'suspended'

export default function StatusControl({ partnerId, currentStatus }: { partnerId: string; currentStatus: Status }) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const isSuspended = currentStatus === 'suspended'
  const isActive    = currentStatus === 'active'

  async function toggle(nextStatus: 'active' | 'suspended') {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/console/partners/${partnerId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: nextStatus }),
    })
    setLoading(false)
    if (res.ok) {
      router.refresh()
    } else {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? '操作に失敗しました')
    }
  }

  if (currentStatus === 'pending') return null   // pending はApprovalPanelで管理

  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
      <h2 style={{ fontSize: '.78rem', fontWeight: 500, margin: '0 0 12px' }}>アカウント管理</h2>
      {isSuspended ? (
        <button
          onClick={() => toggle('active')}
          disabled={loading}
          style={{
            width: '100%', padding: '10px', border: 'none', borderRadius: 9,
            background: 'var(--green)', color: '#fff', fontWeight: 500, fontSize: '.76rem',
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '処理中…' : '停止を解除して稼働に戻す'}
        </button>
      ) : isActive ? (
        <button
          onClick={() => toggle('suspended')}
          disabled={loading}
          style={{
            width: '100%', padding: '10px', border: '1px solid var(--red)', borderRadius: 9,
            background: 'none', color: 'var(--red)', fontWeight: 500, fontSize: '.76rem',
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '処理中…' : 'アカウントを一時停止'}
        </button>
      ) : null}
      {error && <p style={{ fontSize: '.68rem', color: 'var(--red)', marginTop: 8, marginBottom: 0 }}>{error}</p>}
    </div>
  )
}
