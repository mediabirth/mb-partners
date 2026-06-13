'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

type Bank = {
  bank_name?: string; branch_name?: string
  account_type?: string; account_number?: string; account_holder?: string
} | null

type Props = {
  name: string; email: string
  avatarUrl: string | null; avatarColor: string
  partnerCode: string; taxType: string; bank: Bank
}

const LOCK = (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 700, marginLeft: 6 }}>
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 018 0v4"/>
    </svg>
    本人確認
  </span>
)

export default function MypageClient({ name, email, avatarUrl, avatarColor, partnerCode, taxType, bank }: Props) {
  const [editing, setEditing] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(avatarUrl)
  const [phone, setPhone] = useState(() =>
    typeof localStorage !== 'undefined' ? (localStorage.getItem('mp_phone') ?? '') : '')
  const [address, setAddress] = useState(() =>
    typeof localStorage !== 'undefined' ? (localStorage.getItem('mp_address') ?? '') : '')
  const [invoice, setInvoice] = useState(() =>
    typeof localStorage !== 'undefined' ? (localStorage.getItem('mp_invoice') ?? '') : '')
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPhone(localStorage.getItem('mp_phone') ?? '')
    setAddress(localStorage.getItem('mp_address') ?? '')
    setInvoice(localStorage.getItem('mp_invoice') ?? '')
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setAvatar(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function save() {
    localStorage.setItem('mp_phone', phone)
    localStorage.setItem('mp_address', address)
    localStorage.setItem('mp_invoice', invoice)
    setEditing(false)
    showToast('保存しました')
  }

  const taxLabel = taxType === 'individual' ? '個人' : '法人'

  const bankDisplay = bank
    ? `${bank.bank_name ?? ''} ${bank.branch_name ?? ''}`.trim()
    : null
  const accountDisplay = bank
    ? `${bank.account_type ?? ''} ${bank.account_number ? '***' + bank.account_number.slice(-4) : ''}`.trim()
    : null
  const holderDisplay = bank?.account_holder ?? null

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>マイページ</h2>
        </div>
      </div>

      {/* Avatar + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, margin: '0 20px 16px' }}>
        <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
          <span style={{
            width: 56, height: 56, borderRadius: '50%',
            background: avatar ? 'transparent' : avatarColor,
            backgroundImage: avatar ? `url(${avatar})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', fontWeight: 700,
          }}>
            {!avatar && name[0]}
          </span>
          <span style={{
            position: 'absolute', right: -2, bottom: -2,
            width: 20, height: 20, borderRadius: '50%',
            background: '#fff', border: '1px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,.15)',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--txt)" strokeWidth="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatar} />
        <div>
          <b style={{ fontSize: '.95rem' }}>{name}</b>
          <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontFamily: 'Inter', letterSpacing: '.1em', marginTop: 2 }}>
            Partner Code — {partnerCode}
          </div>
        </div>
      </div>

      {!editing ? (
        /* View mode */
        <>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            <KV label={<>お名前 {LOCK}</>} value={name} />
            <KV label="メールアドレス" value={email} />
            <KV label="電話番号" value={phone || '未登録'} muted={!phone} />
            <KV label="住所" value={address || '未登録'} muted={!address} />
            <KV label={<>税区分 {LOCK}</>} value={taxLabel} last />
          </div>

          <div style={{ padding: '0 20px 8px' }}>
            <h2 style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              振込先口座
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 700 }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="4" y="11" width="16" height="10" rx="2"/>
                  <path d="M8 11V7a4 4 0 018 0v4"/>
                </svg>
                本人確認
              </span>
            </h2>
          </div>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            <KV label="銀行 / 支店" value={bankDisplay ?? '未登録'} muted={!bankDisplay} />
            <KV label="口座" value={accountDisplay ?? '未登録'} muted={!accountDisplay} />
            <KV label="名義(カナ)" value={holderDisplay ?? '未登録'} muted={!holderDisplay} />
            <KV label="インボイス登録番号" value={invoice || '未登録'} muted={!invoice} last />
          </div>

          <div style={{ margin: '4px 20px' }}>
            <button onClick={() => setEditing(true)} className="btn btn-p" style={{ width: '100%' }}>
              編集する
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
            </button>
          </div>
        </>
      ) : (
        /* Edit mode */
        <div style={{ margin: '0 20px' }}>
          <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '10px 12px', fontSize: '.64rem', color: '#7A5A14', lineHeight: 1.7, marginBottom: 12 }}>
            🔒の項目の変更は{' '}
            <b style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => showToast('変更申請を受け付けました — 本人確認のご案内をお送りします')}>
              変更を申請
            </b>
            {' '}から。
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 16px' }}>
            <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
              <FldDisabled label="お名前 🔒" value={name} />
            </div>
            <FldDisabled label="メールアドレス 🔒" value={email} />
            <FldEditable label="電話番号" value={phone} onChange={setPhone} placeholder="090-XXXX-XXXX" />
            <FldEditable label="住所" value={address} onChange={setAddress} placeholder="大阪府〇〇市…" />
            <FldDisabled label="税区分 🔒" value={taxLabel} />

            <div style={{ margin: '14px 0 10px', paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
              <label style={{ fontSize: '.63rem', fontWeight: 700, color: 'var(--muted2)' }}>振込先口座 🔒（変更は申請制）</label>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <FldDisabled label="銀行" value={bank?.bank_name ?? ''} />
              <FldDisabled label="支店" value={bank?.branch_name ?? ''} />
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              <FldDisabled label="口座種別 / 番号" value={accountDisplay ?? ''} />
              <FldDisabled label="名義(カナ)" value={holderDisplay ?? ''} />
            </div>
            <FldEditable label="インボイス登録番号(任意)" value={invoice} onChange={setInvoice} placeholder="T0000000000000" />

            <button onClick={save} className="btn btn-p" style={{ width: '100%', marginTop: 4 }}>
              保存する
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
            </button>
            <button onClick={() => setEditing(false)} className="btn btn-g" style={{ width: '100%' }}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div style={{ height: 32 }} />

      {/* Toast */}
      <div style={{
        position: 'fixed', bottom: 98, left: '50%',
        transform: `translateX(-50%) translateY(${toast ? 0 : 16}px)`,
        background: 'var(--txt)', color: '#fff', padding: '12px 22px',
        borderRadius: 9, fontSize: '.74rem', fontWeight: 600,
        opacity: toast ? 1 : 0, pointerEvents: 'none',
        transition: 'all .28s', zIndex: 130, whiteSpace: 'nowrap',
        boxShadow: '0 8px 28px rgba(14,14,20,.18)',
      }}>
        {toast}
      </div>
    </div>
  )
}

function KV({ label, value, muted, last }: { label: React.ReactNode; value: string; muted?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '13px 15px',
      borderBottom: last ? 'none' : '1px solid #F2F2F6',
      fontSize: '.77rem', gap: 10,
    }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0 }}>{label}</div>
      <b style={{ fontSize: '.74rem', color: muted ? 'var(--muted)' : undefined }}>{value}</b>
    </div>
  )
}

function FldDisabled({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} disabled style={{
        width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '12px 13px',
        fontFamily: 'inherit', fontSize: '.82rem', background: 'var(--bg2)', color: 'var(--muted2)', cursor: 'not-allowed',
      }} readOnly />
    </div>
  )
}

function FldEditable({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '12px 13px',
        fontFamily: 'inherit', fontSize: '.82rem', background: '#fff',
      }} />
    </div>
  )
}
