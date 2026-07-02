'use client'
import { useState, useEffect } from 'react'

type BankInfo = {
  bank_name: string
  branch_name: string
  account_type: string
  account_number: string
  account_holder: string
}

type BankRequest = {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  new_bank: BankInfo
  reject_reason: string | null
  created_at: string
}

const EMPTY: BankInfo = {
  bank_name: '', branch_name: '', account_type: '普通',
  account_number: '', account_holder: '',
}

export default function BankChangeSection({ currentBank }: { currentBank: BankInfo | null }) {
  const [open,     setOpen]     = useState(false)
  const [form,     setForm]     = useState<BankInfo>(EMPTY)
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [error,    setError]    = useState('')
  const [requests, setRequests] = useState<BankRequest[]>([])

  useEffect(() => {
    fetch('/api/bank-change-requests')
      .then(r => r.json())
      .then(({ requests }) => setRequests(requests ?? []))
  }, [done])

  const pending = requests.find(r => r.status === 'pending')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/bank-change-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (res.ok) {
      setDone(true)
      setOpen(false)
      setForm(EMPTY)
    } else {
      const j = await res.json()
      setError(j.error ?? '申請に失敗しました')
    }
  }

  const fld = (label: string, key: keyof BankInfo, placeholder = '') => (
    <div className="fld" style={{ marginBottom: 12 }}>
      <label style={{ fontSize: '.68rem', color: 'var(--muted2)', display: 'block', marginBottom: 4 }}>{label}</label>
      {key === 'account_type' ? (
        <select
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: '.78rem', background: '#fff', color: 'var(--text)' }}
        >
          <option value="普通">普通</option>
          <option value="当座">当座</option>
        </select>
      ) : (
        <input
          type={key === 'account_number' ? 'text' : 'text'}
          inputMode={key === 'account_number' ? 'numeric' : undefined}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          required
          style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, fontSize: '.78rem', boxSizing: 'border-box' }}
        />
      )}
    </div>
  )

  return (
    <div style={{ margin: '18px 20px 0' }}>
      {/* 現在の口座情報 */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: '.82rem', fontWeight: 500, margin: 0 }}>振込口座</h3>
          {!pending && (
            <button
              onClick={() => { setOpen(o => !o); setDone(false); setError('') }}
              style={{ fontSize: '.68rem', color: 'var(--blue)', background: 'none', border: '1px solid var(--blue)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }}
            >
              {open ? 'キャンセル' : '口座を変更する'}
            </button>
          )}
        </div>

        {currentBank ? (
          <div style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
            <div>{currentBank.bank_name}　{currentBank.branch_name}</div>
            <div>{currentBank.account_type}　{currentBank.account_number}</div>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>{currentBank.account_holder}</div>
          </div>
        ) : (
          <p style={{ fontSize: '.72rem', color: 'var(--muted2)', margin: 0 }}>未登録</p>
        )}

        {/* 承認待ちバナー */}
        {pending && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#FBF1DF', borderRadius: 8, fontSize: '.68rem', color: '#A06914' }}>
            ⏳ 口座変更申請を受け付けました。管理者が確認中です。
          </div>
        )}

        {/* 完了メッセージ */}
        {done && !pending && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#E5F3F1', borderRadius: 8, fontSize: '.68rem', color: '#0F7A6A' }}>
            ✓ 申請を送信しました。承認後に口座情報が更新されます。
          </div>
        )}

        {/* 却下された申請 */}
        {requests.filter(r => r.status === 'rejected').slice(0, 1).map(r => (
          <div key={r.id} style={{ marginTop: 12, padding: '8px 12px', background: '#FDE8E8', borderRadius: 8, fontSize: '.68rem', color: '#B91C1C' }}>
            ✗ 直近の申請が却下されました。{r.reject_reason && `理由: ${r.reject_reason}`}
          </div>
        ))}

        {/* 変更フォーム */}
        {open && !pending && (
          <form onSubmit={handleSubmit} style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', marginBottom: 12 }}>
              新しい口座情報を入力してください。管理者の承認後に反映されます。
            </p>
            {fld('銀行名', 'bank_name', '例: 三菱UFJ銀行')}
            {fld('支店名', 'branch_name', '例: 渋谷支店')}
            {fld('口座種別', 'account_type')}
            {fld('口座番号', 'account_number', '例: 1234567')}
            {fld('口座名義（カナ）', 'account_holder', '例: ヤマダ タロウ')}
            {error && <p style={{ fontSize: '.68rem', color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '10px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 8, fontSize: '.78rem', fontWeight: 500, cursor: loading ? 'default' : 'pointer', opacity: loading ? .7 : 1 }}
            >
              {loading ? '送信中...' : '変更を申請する'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
