'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import ProfileHeader from '@/components/ui/ProfileHeader'
import AvatarEditor from '@/components/ui/AvatarEditor'

type Bank = {
  bank_name?: string; branch_name?: string
  account_type?: string; account_number?: string; account_holder?: string
} | null

type Props = {
  name: string; email: string
  avatarUrl: string | null; avatarColor: string
  partnerCode: string; taxType: string; bank: Bank
  nickname: string | null
  isFrontier?: boolean
}

const LOCK = (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 018 0v4"/>
    </svg>
    本人確認
  </span>
)

export default function MypageClient({ name, email, avatarUrl, avatarColor, partnerCode, taxType, bank, nickname: initialNickname, isFrontier }: Props) {
  const [editing, setEditing] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(avatarUrl)
  const [nickname, setNickname] = useState(initialNickname ?? '')
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

  async function save() {
    localStorage.setItem('mp_phone', phone)
    localStorage.setItem('mp_address', address)
    localStorage.setItem('mp_invoice', invoice)
    // Save nickname to DB
    await fetch('/api/mypage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    })
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
          <h2 style={{ fontSize: '.98rem', fontWeight: 500 }}>マイページ</h2>
        </div>
      </div>

      {/* F-4：プロフィールヘッダー（3サーフェス共通）＋本人アバター編集（アップロード/イニシャル）。 */}
      <ProfileHeader
        avatar={<AvatarEditor name={name} color={avatarColor} src={avatar} size={56} endpoint="/api/app/avatar" />}
        name={name}
        badges={<span className="chip chip-referral" style={{ fontFamily: 'Inter', letterSpacing: '.08em' }}>{partnerCode}</span>}
      />

      {!editing ? (
        /* View mode */
        <>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            <KV label="ニックネーム(表示名)" value={nickname || '未設定'} muted={!nickname} />
            <KV label={<>お名前 {LOCK}</>} value={name} />
            <KV label="メールアドレス" value={email} />
            <KV label="電話番号" value={phone || '未登録'} muted={!phone} />
            <KV label="住所" value={address || '未登録'} muted={!address} />
            <KV label={<>税区分 {LOCK}</>} value={taxLabel} last />
          </div>

          {/* フロンティア導線（A確定・ホームから移設）。is_frontier 保有チームのみ表示（現行ゲート踏襲）。機能非接触＝場所のみ。 */}
          {isFrontier && (
            <a href="/app/frontier" className="card-hover lift" style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '14px 16px', textDecoration: 'none', color: 'var(--txt)' }}>
              <span style={{ color: 'var(--c-blue)', display: 'flex', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
                  <rect x="19" y="19" width="10" height="10" rx="3" fill="currentColor" />
                  <rect x="6" y="6" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                  <rect x="34" y="6" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                  <rect x="6" y="34" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                  <rect x="34" y="34" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                </svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>フロンティア ダッシュボード</div>
                <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 1 }}>チームの招待・オーバーライドを管理</div>
              </div>
              <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>›</span>
            </a>
          )}

          <div style={{ padding: '0 20px 8px' }}>
            <h2 style={{ fontSize: '.78rem', fontWeight: 500, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              振込先口座
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 500 }}>
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
            </button>
          </div>
        </>
      ) : (
        /* Edit mode */
        <div style={{ margin: '0 20px' }}>
          <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '10px 12px', fontSize: '.64rem', color: '#7A5A14', lineHeight: 1.7, marginBottom: 12 }}>
            🔒の項目の変更は{' '}
            <span style={{ fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => showToast('変更申請を受け付けました — 本人確認のご案内をお送りします')}>
              変更を申請
            </span>
            {' '}から。
          </div>

          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 16px' }}>
            <FldEditable label="ニックネーム(表示名)" value={nickname} onChange={setNickname} placeholder="チャットや案件一覧に表示される名前" />
            <div style={{ display: 'flex', gap: 9, marginBottom: 12 }}>
              <FldDisabled label="お名前 🔒" value={name} />
            </div>
            <FldDisabled label="メールアドレス 🔒" value={email} />
            <FldEditable label="電話番号" value={phone} onChange={setPhone} placeholder="09012345678" />
            <FldEditable label="住所" value={address} onChange={setAddress} placeholder="大阪府〇〇市…" />
            <FldDisabled label="税区分 🔒" value={taxLabel} />

            <div style={{ margin: '14px 0 10px', paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
              <label style={{ fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)' }}>振込先口座 🔒（変更は申請制）</label>
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
        borderRadius: 9, fontSize: '.74rem', fontWeight: 500,
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
      <span style={{ fontWeight: 500, fontSize: '.74rem', color: muted ? 'var(--muted)' : undefined }}>{value}</span>
    </div>
  )
}

function FldDisabled({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
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
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '12px 13px',
        fontFamily: 'inherit', fontSize: '.82rem', background: '#fff',
      }} />
    </div>
  )
}
