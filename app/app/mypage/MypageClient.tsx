'use client'
/**
 * マイページ v2（整合性プログラム B）。
 * - 「変更を申請」制度は廃止：氏名・電話・住所・インボイス番号は直接編集し DB へ保存（A4根因の localStorage 保存を撤廃）
 * - 振込口座も直接変更可。ただし変更時は登録メールへ通知＋audit_logs へ履歴記録（サーバ側で必須化）
 * - ニックネームは廃止（UI撤去・profiles.nickname は deprecate 残置）
 * - v2.2: 0.5px罫線・weight 400/500・塗りなし・静かな規律
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProfileHeader from '@/components/ui/ProfileHeader'
import AvatarEditor from '@/components/ui/AvatarEditor'
import BankBranchSelect, { type BankDraft } from '@/components/ui/BankBranchSelect'

type Bank = {
  bank_name?: string; branch_name?: string
  account_type?: string; account_number?: string; account_holder?: string
} | null

type Props = {
  name: string; email: string
  avatarUrl: string | null; avatarColor: string
  partnerCode: string; taxType: string; bank: Bank
  phone: string | null; address: string | null; invoiceNumber: string | null
  isFrontier?: boolean
  isSupplier?: boolean
}

const LINE = '0.5px solid var(--line)'

const LOCK = (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 018 0v4"/>
    </svg>
    ログインID
  </span>
)

export default function MypageClient({ name: initialName, email, avatarUrl, avatarColor, partnerCode, taxType, bank, phone: initialPhone, address: initialAddress, invoiceNumber: initialInvoice, isFrontier, isSupplier }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [avatar, setAvatar] = useState<string | null>(avatarUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // 基本情報
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [address, setAddress] = useState(initialAddress ?? '')
  const [invoice, setInvoice] = useState(initialInvoice ?? '')

  // 振込口座（編集モードで「変更する」を開いたときのみ描画）
  const [bankOpen, setBankOpen] = useState(false)
  const [bankDraft, setBankDraft] = useState<BankDraft>({ bank_name: '', branch_name: '' })
  const [accountType, setAccountType] = useState(bank?.account_type ?? '普通')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState(bank?.account_holder ?? '')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  function resetEdits() {
    setName(initialName); setPhone(initialPhone ?? ''); setAddress(initialAddress ?? ''); setInvoice(initialInvoice ?? '')
    setBankOpen(false); setBankDraft({ bank_name: '', branch_name: '' })
    setAccountType(bank?.account_type ?? '普通'); setAccountNumber(''); setAccountHolder(bank?.account_holder ?? '')
    setError('')
  }

  async function save() {
    setSaving(true); setError('')
    try {
      // 基本情報（氏名・電話・住所・インボイス）
      const res = await fetch('/api/mypage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), address: address.trim(), invoice_number: invoice.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); setSaving(false); return }

      // 振込口座（変更フォームを開いて入力した場合のみ）
      if (bankOpen) {
        if (!bankDraft.bank_name || !bankDraft.branch_name || !accountNumber.trim() || !accountHolder.trim()) {
          setError('振込先口座をすべて入力してください（変更しない場合は「変更をやめる」で閉じてください）')
          setSaving(false); return
        }
        const br = await fetch('/api/mypage/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bank_name: bankDraft.bank_name, branch_name: bankDraft.branch_name,
            account_type: accountType, account_number: accountNumber.trim(), account_holder: accountHolder.trim(),
          }),
        })
        const bd = await br.json().catch(() => ({}))
        if (!br.ok) { setError(bd.error ?? '振込口座の変更に失敗しました'); setSaving(false); return }
        showToast('保存しました。口座変更の確認メールをお送りしています')
      } else {
        showToast('保存しました')
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('保存に失敗しました。通信環境をご確認ください')
    } finally {
      setSaving(false)
    }
  }

  const taxLabel = taxType === 'individual' ? '個人' : '法人'
  const bankDisplay = bank ? `${bank.bank_name ?? ''} ${bank.branch_name ?? ''}`.trim() : null
  const accountDisplay = bank ? `${bank.account_type ?? ''} ${bank.account_number ? '***' + bank.account_number.slice(-4) : ''}`.trim() : null
  const holderDisplay = bank?.account_holder ?? null

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 500 }}>マイページ</h2>
        </div>
      </div>

      <ProfileHeader
        avatar={<AvatarEditor name={name} color={avatarColor} src={avatar} size={56} endpoint="/api/app/avatar" onChange={setAvatar} />}
        name={name}
        badges={<span className="chip chip-referral" style={{ fontFamily: 'Inter', letterSpacing: '.08em' }}>{partnerCode}</span>}
      />

      {!editing ? (
        <>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: LINE, borderRadius: 13, overflow: 'hidden' }}>
            <KV label="お名前" value={name} />
            <KV label={<>メールアドレス {LOCK}</>} value={email} />
            <KV label="電話番号" value={phone || '未登録'} muted={!phone} />
            <KV label="住所" value={address || '未登録'} muted={!address} />
            <KV label="税区分" value={taxLabel} last />
          </div>

          {/* ペルソナ・ホーム（2026-07-13）: 役割導線カードは撤去＝ホーム自体が役割適応（/app） */}


          <div style={{ padding: '0 20px 8px' }}>
            <h2 style={{ fontSize: '.78rem', fontWeight: 500, marginBottom: 0 }}>振込先口座</h2>
          </div>
          <div style={{ margin: '0 20px 14px', background: '#fff', border: LINE, borderRadius: 13, overflow: 'hidden' }}>
            <KV label="銀行 / 支店" value={bankDisplay || '未登録'} muted={!bankDisplay} />
            <KV label="口座" value={accountDisplay || '未登録'} muted={!accountDisplay} />
            <KV label="名義(カナ)" value={holderDisplay || '未登録'} muted={!holderDisplay} />
            <KV label="インボイス登録番号" value={invoice || '未登録'} muted={!invoice} last />
          </div>

          <div style={{ margin: '4px 20px' }}>
            <button onClick={() => { resetEdits(); setEditing(true) }} className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>
              編集する
            </button>
          </div>
        </>
      ) : (
        <div style={{ margin: '0 20px' }}>
          <div style={{ background: '#fff', border: LINE, borderRadius: 13, padding: '18px 16px' }}>
            <Fld label="お名前" value={name} onChange={setName} placeholder="山田 太郎" />
            <FldDisabled label={<>メールアドレス {LOCK}</>} value={email} hint="ログインIDのため変更はサポートまでご連絡ください" />
            <Fld label="電話番号" value={phone} onChange={setPhone} placeholder="09012345678" inputMode="tel" />
            <Fld label="住所" value={address} onChange={setAddress} placeholder="大阪府〇〇市…" />
            <FldDisabled label="税区分" value={taxLabel} hint="変更はサポートまでご連絡ください" />
            <Fld label="インボイス登録番号（任意）" value={invoice} onChange={setInvoice} placeholder="T0000000000000" />

            <div style={{ margin: '14px 0 10px', paddingTop: 12, borderTop: '0.5px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <label style={{ fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)' }}>振込先口座</label>
              <button type="button" onClick={() => setBankOpen(o => !o)} style={{ border: 'none', background: 'none', color: 'var(--c-blue)', fontSize: '.68rem', fontWeight: 500, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                {bankOpen ? '変更をやめる' : '変更する'}
              </button>
            </div>

            {!bankOpen ? (
              <div style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
                {bankDisplay ? `${bankDisplay}　${accountDisplay ?? ''}` : '未登録'}
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '.64rem', color: 'var(--muted2)', lineHeight: 1.7, margin: '0 0 12px' }}>
                  変更内容は登録メールアドレスへ通知され、変更履歴が記録されます。
                </p>
                <BankBranchSelect value={bankDraft} onChange={setBankDraft} />
                <div style={{ display: 'flex', gap: 8, margin: '13px 0' }}>
                  {['普通', '当座'].map(v => (
                    <button key={v} type="button" onClick={() => setAccountType(v)}
                      style={{ flex: 1, padding: '10px', borderRadius: 9, border: accountType === v ? '1.5px solid var(--c-blue)' : LINE, background: '#fff', color: accountType === v ? 'var(--c-blue)' : 'var(--txt)', fontWeight: 500, fontSize: '.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {v}
                    </button>
                  ))}
                </div>
                <Fld label="口座番号" value={accountNumber} onChange={setAccountNumber} placeholder="1234567" inputMode="numeric" />
                <Fld label="口座名義（カナ）" value={accountHolder} onChange={setAccountHolder} placeholder="ヤマダ タロウ" />
              </div>
            )}

            {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 10 }}>{error}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              <button onClick={save} className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
                {saving ? '保存中…' : '保存する'}
              </button>
              <button onClick={() => { resetEdits(); setEditing(false) }} className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 32 }} />

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
      borderBottom: last ? 'none' : '0.5px solid var(--line)',
      fontSize: '.77rem', gap: 10,
    }}>
      <div style={{ color: 'var(--muted2)', flexShrink: 0 }}>{label}</div>
      <span style={{ fontWeight: 500, fontSize: '.74rem', color: muted ? 'var(--muted)' : undefined, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

function FldDisabled({ label, value, hint }: { label: React.ReactNode; value: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} disabled style={{
        width: '100%', border: LINE, borderRadius: 9, padding: '12px 13px',
        fontFamily: 'inherit', fontSize: '.82rem', background: 'var(--bg2)', color: 'var(--muted2)', cursor: 'not-allowed',
      }} readOnly />
      {hint && <p style={{ fontSize: '.6rem', color: 'var(--muted)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  )
}

function Fld({ label, value, onChange, placeholder, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
  inputMode?: 'tel' | 'numeric'
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} style={{
        width: '100%', border: LINE, borderRadius: 9, padding: '12px 13px',
        fontFamily: 'inherit', fontSize: '.82rem', background: '#fff',
      }} />
    </div>
  )
}
