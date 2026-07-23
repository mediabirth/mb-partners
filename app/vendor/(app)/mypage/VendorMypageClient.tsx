'use client'
/**
 * 設定（受託者）— APP パートナー版（app/app/mypage/MypageClient.tsx）と 1:1 同型。
 * 構造・見出し・トークン・編集文法・空状態「未登録」・トースト・ボタン系（btn btn-p/btn-g）を APP と一致させる。
 * 正当な固有差のみ:
 *  - ID表記＝display_code（partnerCode と同型式・同 chip）
 *  - お名前/税区分/振込先/インボイスは KYC 確定項目のため編集不可（APP は編集可）＝表示は同型・編集フォームは FldDisabled
 *  - 編集可能＝電話・住所（KYC 非該当）。ニックネームは APP 同様 UI 廃止（表示名＝屋号/お名前）。
 *  - フロンティア/パートナーコードは無し（受託者固有）。
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProfileHeader from '@/components/ui/ProfileHeader'
import AvatarEditor from '@/components/ui/AvatarEditor'

type Props = {
  name: string; email: string
  avatarUrl: string | null; avatarColor: string
  displayCode: string | null; taxType: string | null
  phone: string | null; address: string | null; invoiceNumber: string | null
  bankName: string | null; bankBranch: string | null; bankAccount: string | null; bankHolderKana: string | null
}

const LINE = '0.5px solid var(--line)'
const LOCK = (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
    ログインID
  </span>
)

export default function VendorMypageClient({ name, email, avatarUrl, avatarColor, displayCode, taxType, phone: initialPhone, address: initialAddress, invoiceNumber, bankName, bankBranch, bankAccount, bankHolderKana }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(avatarUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [address, setAddress] = useState(initialAddress ?? '')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2600) }
  function resetEdits() { setPhone(initialPhone ?? ''); setAddress(initialAddress ?? ''); setError('') }

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/vendor/mypage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), address: address.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); setSaving(false); return }
      showToast('保存しました'); setEditing(false); router.refresh()
    } catch { setError('保存に失敗しました。通信環境をご確認ください') } finally { setSaving(false) }
  }

  const taxLabel = taxType === 'individual' || taxType === '個人' ? '個人' : taxType === 'corporate' || taxType === '法人' ? '法人' : (taxType || '未登録')
  const bankDisplay = bankName ? `${bankName} ${bankBranch ?? ''}`.trim() : null
  // 口座は APP と同型「種別 ***下4桁」でマスク表示（bank_account は「普通1234567」形式で保存）。
  const accountDisplay = bankAccount ? (() => {
    const m = /^(普通|当座)(.*)$/.exec(bankAccount)
    const type = m ? m[1] : ''
    const num = m ? m[2] : bankAccount
    return `${type} ${num ? '***' + num.slice(-4) : ''}`.trim()
  })() : null

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 500 }}>設定</h2>
        </div>
      </div>

      <ProfileHeader
        avatar={<AvatarEditor name={name} color={avatarColor} src={avatar} size={56} endpoint="/api/vendor/avatar" onChange={setAvatar} />}
        name={name}
        badges={displayCode ? <span className="chip chip-referral" style={{ fontFamily: 'Inter', letterSpacing: '.08em' }}>{displayCode}</span> : null}
      />

      {!editing ? (
        <>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: LINE, borderRadius: 13, overflow: 'hidden' }}>
            <KV label="お名前" value={name} />
            <KV label={<>メールアドレス {LOCK}</>} value={email} />
            <KV label="電話番号" value={phone || '未登録'} muted={!phone} />
            <KV label="住所" value={address || '未登録'} muted={!address} />
            <KV label="税区分" value={taxLabel} muted={taxLabel === '未登録'} last />
          </div>

          <div style={{ padding: '0 20px 8px' }}>
            <h2 style={{ fontSize: '.78rem', fontWeight: 500, marginBottom: 0 }}>振込先口座</h2>
          </div>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: LINE, borderRadius: 13, overflow: 'hidden' }}>
            <KV label="銀行 / 支店" value={bankDisplay || '未登録'} muted={!bankDisplay} />
            <KV label="口座" value={accountDisplay || '未登録'} muted={!accountDisplay} />
            <KV label="名義(カナ)" value={bankHolderKana || '未登録'} muted={!bankHolderKana} />
            <KV label="インボイス登録番号" value={invoiceNumber || '未登録'} muted={!invoiceNumber} last />
          </div>

          <div style={{ margin: '4px 20px' }}>
            <button onClick={() => { resetEdits(); setEditing(true) }} className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>編集する</button>
          </div>
        </>
      ) : (
        <div style={{ margin: '0 20px' }}>
          <div style={{ background: '#fff', border: LINE, borderRadius: 13, padding: '18px 16px' }}>
            <FldDisabled label="お名前" value={name} hint="本人確認で確定した項目のため、変更はサポートまでご連絡ください" />
            <FldDisabled label={<>メールアドレス {LOCK}</>} value={email} hint="ログインIDのため変更はサポートまでご連絡ください" />
            <Fld label="電話番号" value={phone} onChange={setPhone} placeholder="09012345678" inputMode="tel" />
            <Fld label="住所" value={address} onChange={setAddress} placeholder="大阪府〇〇市…" />
            <FldDisabled label="税区分" value={taxLabel} hint="変更はサポートまでご連絡ください" />
            <FldDisabled label="インボイス登録番号" value={invoiceNumber || '未登録'} hint="本人確認で確定した項目のため、変更はサポートまでご連絡ください" />

            <div style={{ margin: '14px 0 10px', paddingTop: 12, borderTop: '0.5px dashed var(--line)' }}>
              <label style={{ fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)' }}>振込先口座</label>
              <div style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.7, marginTop: 8 }}>
                {bankDisplay ? `${bankDisplay}　${accountDisplay ?? ''}` : '未登録'}
              </div>
              <p style={{ fontSize: '.6rem', color: 'var(--muted)', margin: '6px 0 0' }}>本人確認で確定した項目のため、変更はサポートまでご連絡ください。</p>
            </div>

            {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 10 }}>{error}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button onClick={save} className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>{saving ? '保存中…' : '保存する'}</button>
              <button onClick={() => { resetEdits(); setEditing(false) }} className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 32 }} />
      <div style={{ position: 'fixed', bottom: 98, left: '50%', transform: `translateX(-50%) translateY(${toast ? 0 : 16}px)`, background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 500, opacity: toast ? 1 : 0, pointerEvents: 'none', transition: 'all .28s', zIndex: 130, whiteSpace: 'nowrap', boxShadow: '0 8px 28px rgba(14,14,20,.18)' }}>{toast}</div>
    </div>
  )
}

function KV({ label, value, muted, last }: { label: React.ReactNode; value: string; muted?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 15px', borderBottom: last ? 'none' : '0.5px solid var(--line)', fontSize: '.77rem', gap: 10 }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0 }}>{label}</div>
      <span style={{ fontWeight: 500, fontSize: '.74rem', color: muted ? 'var(--muted)' : undefined, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}
function FldDisabled({ label, value, hint }: { label: React.ReactNode; value: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} disabled readOnly style={{ width: '100%', border: LINE, borderRadius: 9, padding: '12px 13px', fontFamily: 'inherit', fontSize: '.82rem', background: 'var(--bg2)', color: 'var(--muted2)', cursor: 'not-allowed' }} />
      {hint && <p style={{ fontSize: '.6rem', color: 'var(--muted)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}
function Fld({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'tel' | 'numeric' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} style={{ width: '100%', border: LINE, borderRadius: 9, padding: '12px 13px', fontFamily: 'inherit', fontSize: '.82rem', background: '#fff' }} />
    </div>
  )
}
