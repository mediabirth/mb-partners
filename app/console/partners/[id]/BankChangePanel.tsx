'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type BankInfo = {
  bank_name: string
  branch_name: string
  account_type: string
  account_number: string
  account_holder: string
}

type BankRequest = {
  id: string
  before_bank: BankInfo | null
  new_bank: BankInfo
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  created_at: string
  reviewed_at: string | null
}

function BankRow({ label, info }: { label: string; info: BankInfo | null }) {
  if (!info) return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '.72rem', color: 'var(--muted2)', fontStyle: 'italic' }}>未登録</div>
    </div>
  )
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '.72rem', lineHeight: 1.7 }}>
        <div>{info.bank_name}　{info.branch_name}</div>
        <div>{info.account_type}　{info.account_number}</div>
        <div style={{ fontWeight: 500 }}>{info.account_holder}</div>
      </div>
    </div>
  )
}

export default function BankChangePanel({ requests }: { requests: BankRequest[] }) {
  const router = useRouter()
  const [loading,       setLoading]       = useState<string | null>(null)
  const [rejectReason,  setRejectReason]  = useState('')
  const [rejectTarget,  setRejectTarget]  = useState<string | null>(null)
  const [error,         setError]         = useState('')

  const pending = requests.filter(r => r.status === 'pending')
  const history = requests.filter(r => r.status !== 'pending')

  async function handleAction(id: string, action: 'approve' | 'reject') {
    if (action === 'reject' && !rejectReason.trim()) {
      setError('却下理由を入力してください')
      return
    }
    setLoading(id + action)
    setError('')
    const res = await fetch(`/api/console/bank-change-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reject_reason: action === 'reject' ? rejectReason.trim() : undefined,
      }),
    })
    setLoading(null)
    if (res.ok) {
      setRejectTarget(null)
      setRejectReason('')
      router.refresh()
    } else {
      const j = await res.json()
      setError(j.error ?? '操作に失敗しました')
    }
  }

  if (requests.length === 0) return null

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: '.88rem', fontWeight: 500, marginBottom: 12 }}>口座変更申請</h3>

      {/* Pending */}
      {pending.map(req => (
        <div key={req.id} style={{
          border: '2px solid var(--amber)',
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 14,
          background: '#FFFBF2',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--amber)' }}>⏳ 承認待ち</span>
            <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>
              {new Date(req.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
            </span>
          </div>

          {/* Before / After diff */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <BankRow label="変更前" info={req.before_bank} />
            <div style={{ width: 1, background: 'var(--line)' }} />
            <BankRow label="変更後（申請）" info={req.new_bank} />
          </div>

          {/* Actions */}
          {rejectTarget === req.id ? (
            <div>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="却下理由を入力してください（必須）"
                rows={2}
                style={{ width: '100%', padding: '8px 10px', border: '0.5px solid var(--line)', borderRadius: 8, fontSize: '.72rem', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleAction(req.id, 'reject')}
                  disabled={loading === req.id + 'reject'}
                  style={{ flex: 1, padding: '9px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '.72rem', fontWeight: 500, cursor: 'pointer' }}
                >
                  {loading === req.id + 'reject' ? '処理中…' : '却下を確定'}
                </button>
                <button
                  onClick={() => { setRejectTarget(null); setRejectReason('') }}
                  style={{ padding: '9px 14px', background: 'none', border: '0.5px solid var(--line)', borderRadius: 8, fontSize: '.72rem', cursor: 'pointer' }}
                >
                  戻る
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => handleAction(req.id, 'approve')}
                disabled={loading === req.id + 'approve'}
                style={{ flex: 1, padding: '9px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '.72rem', fontWeight: 500, cursor: 'pointer' }}
              >
                {loading === req.id + 'approve' ? '処理中…' : '承認する'}
              </button>
              <button
                onClick={() => setRejectTarget(req.id)}
                style={{ flex: 1, padding: '9px', background: 'none', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 8, fontSize: '.72rem', fontWeight: 500, cursor: 'pointer' }}
              >
                却下する
              </button>
            </div>
          )}

          {error && <p style={{ fontSize: '.68rem', color: 'var(--red)', marginTop: 8 }}>{error}</p>}
        </div>
      ))}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 8 }}>過去の申請</div>
          {history.map(req => (
            <div key={req.id} style={{
              border: '0.5px solid var(--line)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 8,
              background: '#fff',
              opacity: .85,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{
                  fontSize: '.66rem', fontWeight: 500,
                  color: req.status === 'approved' ? 'var(--green)' : 'var(--red)',
                }}>
                  {req.status === 'approved' ? '承認済' : '却下'}
                </span>
                <span style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>
                  {req.reviewed_at && new Date(req.reviewed_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <BankRow label="変更前" info={req.before_bank} />
                <BankRow label="変更後" info={req.new_bank} />
              </div>
              {req.reject_reason && (
                <div style={{ marginTop: 8, fontSize: '.66rem', color: 'var(--red)' }}>
                  却下理由: {req.reject_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
