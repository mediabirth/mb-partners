'use client'
/**
 * ベンダーのマイページ（APP と同じ編集モード文法）。
 * 非KYC項目（ニックネーム・電話・住所）はインライン編集→PATCH /api/vendor/mypage。
 * KYC確定項目（お名前・税区分・振込先・インボイス）は lock 表示で編集不可（KYC経路のみ）＝固有仕様を保持。
 * アバターは編集可（/api/vendor/avatar）。表示名はベンダーアイデンティティ（delivery 側）を正とする。
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProfileHeader from '@/components/ui/ProfileHeader'
import AvatarEditor from '@/components/ui/AvatarEditor'

type Props = {
  vendorName: string           // 表示名の正（delivery 名）
  avatarUrl: string | null
  color: string
  displayCode: string | null
  d: {
    nickname: string | null; name: string; contact_email: string | null; phone: string | null; address: string | null; tax_type: string | null
    bank_name: string | null; bank_branch: string | null; bank_account: string | null; bank_holder_kana: string | null; invoice_number: string | null
  }
}

function LockRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 15px', borderBottom: last ? 'none' : '0.5px solid var(--line)', fontSize: '.77rem', gap: 10 }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" aria-label="本人確認"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
      </div>
      <b style={{ fontSize: '.74rem', textAlign: 'right' }}>{value}</b>
    </div>
  )
}
function ViewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 15px', borderBottom: last ? 'none' : '0.5px solid var(--line)', fontSize: '.77rem', gap: 10 }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0 }}>{label}</div>
      <b style={{ fontSize: '.74rem', textAlign: 'right' }}>{value}</b>
    </div>
  )
}
function EditRow({ label, value, onChange, placeholder, last }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 15px', borderBottom: last ? 'none' : '0.5px solid var(--line)', fontSize: '.77rem', gap: 10 }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0 }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, textAlign: 'right', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: '.76rem', background: 'var(--bg)' }} />
    </div>
  )
}

export default function VendorMypageClient({ vendorName, avatarUrl, color, displayCode, d }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [nickname, setNickname] = useState(d.nickname ?? '')
  const [phone, setPhone] = useState(d.phone ?? '')
  const [address, setAddress] = useState(d.address ?? '')

  async function save() {
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/vendor/mypage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, phone, address }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setEditing(false); setMsg('保存しました'); router.refresh() }
      else setMsg(j.error || '保存に失敗しました')
    } catch { setMsg('通信に失敗しました') } finally { setSaving(false) }
  }
  function cancel() { setNickname(d.nickname ?? ''); setPhone(d.phone ?? ''); setAddress(d.address ?? ''); setEditing(false); setMsg('') }

  const bankLine = d.bank_name ? `${d.bank_name} ${d.bank_branch ?? ''}`.trim() : '—'

  return (
    <div className="page-anim" style={{ paddingTop: 22 }}>
      <div style={{ padding: '0 24px 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-.01em' }}>マイページ</span>
        {msg && <span style={{ fontSize: '.62rem', color: msg.includes('失敗') ? 'var(--red)' : 'var(--muted2)' }}>{msg}</span>}
      </div>
      <ProfileHeader
        avatar={<AvatarEditor name={vendorName} color={color} src={avatarUrl} size={56} endpoint="/api/vendor/avatar" />}
        name={vendorName}
        badges={<>
          <span style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--c-blue)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '2px 10px' }}>MB Partners デリバリー</span>
          {displayCode && <span style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '2px 10px', fontFamily: 'Inter' }}>{displayCode}</span>}
        </>}
      />

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 500 }}>プロフィール</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        {editing ? (
          <>
            <EditRow label="ニックネーム（表示名）" value={nickname} onChange={setNickname} placeholder={d.name} />
            <LockRow label="お名前" value={d.name} />
            <ViewRow label="メールアドレス" value={d.contact_email ?? '—'} />
            <EditRow label="電話番号" value={phone} onChange={setPhone} placeholder="090-0000-0000" />
            <EditRow label="住所" value={address} onChange={setAddress} placeholder="東京都…" />
            <LockRow label="税区分" value={d.tax_type ?? '—'} last />
          </>
        ) : (
          <>
            <ViewRow label="ニックネーム（表示名）" value={d.nickname ?? vendorName} />
            <LockRow label="お名前" value={d.name} />
            <ViewRow label="メールアドレス" value={d.contact_email ?? '—'} />
            <ViewRow label="電話番号" value={d.phone ?? '—'} />
            <ViewRow label="住所" value={d.address ?? '—'} />
            <LockRow label="税区分" value={d.tax_type ?? '—'} last />
          </>
        )}
      </div>

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 500 }}>振込先口座</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <LockRow label="銀行・支店" value={bankLine} />
        <LockRow label="口座" value={d.bank_account ?? '—'} />
        <LockRow label="名義（カナ）" value={d.bank_holder_kana ?? '—'} />
        <LockRow label="インボイス登録番号" value={d.invoice_number ?? '—'} last />
      </div>
      <p style={{ padding: '0 24px', fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>お名前・税区分・振込先・インボイス番号は本人確認で確定した項目です。変更が必要な場合はお問い合わせください。</p>

      <div style={{ margin: '0 20px 30px', display: 'flex', gap: 10 }}>
        {editing ? (
          <>
            <button onClick={cancel} disabled={saving} className="ui-btn ui-btn--secondary ui-btn--lg" style={{ flex: 1, justifyContent: 'center' }}>キャンセル</button>
            <button onClick={save} disabled={saving} className="ui-btn ui-btn--primary ui-btn--lg" style={{ flex: 1, justifyContent: 'center' }}>{saving ? '保存中…' : '保存する'}</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }}>編集する</button>
        )}
      </div>
    </div>
  )
}
