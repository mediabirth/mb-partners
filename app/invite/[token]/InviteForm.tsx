'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import BankBranchSelect, { type BankDraft } from '@/components/ui/BankBranchSelect'

type Step = 1 | 2 | 3 | 4
type Step2Field = 'lastName' | 'firstName' | 'phone' | 'address'
type Step2Errors = Partial<Record<Step2Field, string>>
const STEP_LABELS = ['アカウント', '基本情報', '報酬受取', '確認と同意']

const card: React.CSSProperties = { width: '100%', maxWidth: 430, background: '#fff', minHeight: '100dvh', boxShadow: '0 0 48px rgba(14,14,20,.10)', display: 'flex', flexDirection: 'column' }
const input: React.CSSProperties = { width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.86rem', color: 'var(--txt)', background: '#fff' }
const lbl: React.CSSProperties = { display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }

function Field({ label, children, error }: { label: React.ReactNode; children: React.ReactNode; error?: string }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <span style={lbl}>{label}</span>
      {children}
      {error && <p role="alert" style={{ color: 'var(--red)', fontSize: '.62rem', lineHeight: 1.5, margin: '4px 0 0' }}>{error}</p>}
    </div>
  )
}

export default function InviteForm({ email, defaultName, token }: { email: string; defaultName: string; token: string }) {
  const router = useRouter()
  const sp = useSearchParams()
  const frontierFlag = sp.get('role') === 'frontier'   // フロンティアとして登録
  const frontierId = sp.get('f') || undefined          // 配下として紐づくフロンティアID
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [code, setCode] = useState<string | null>(null)

  // STEP1
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  // STEP2（①招待時の氏名は「姓 名」でスペース区切りがある時だけ分割。無ければ空欄で本人入力＝フルネームが姓に入らない）
  const nameParts = (defaultName ?? '').trim().split(/[\s　]+/).filter(Boolean)
  const [lastName, setLastName] = useState(nameParts.length >= 2 ? nameParts[0] : '')
  const [firstName, setFirstName] = useState(nameParts.length >= 2 ? nameParts.slice(1).join(' ') : '')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')   // B: 住所（支払調書の送付・税務手続に使用）
  const [step2Errors, setStep2Errors] = useState<Step2Errors>({})
  // STEP3
  const [taxType, setTaxType] = useState<'individual' | 'corporate'>('individual')
  // B: 銀行→支店は全銀マスタの段階選択（自由入力フォールバック付き）
  const [bankDraft, setBankDraft] = useState<BankDraft>({ bank_name: '', branch_name: '' })
  const bankName = bankDraft.bank_name
  const branchName = bankDraft.branch_name
  const [accountType, setAccountType] = useState('普通')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  // STEP4
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)

  const step1ok = password.length >= 8 && password === passwordConfirm
  const step3ok = !!bankName.trim() && !!branchName.trim() && !!accountNumber.trim() && !!accountHolder.trim()
  const step4ok = agreeTerms && agreePrivacy

  function clearStep2Error(field: Step2Field) {
    setStep2Errors(current => {
      if (!current[field]) return current
      const nextErrors = { ...current }
      delete nextErrors[field]
      return nextErrors
    })
  }

  function next() {
    setError('')
    if (step === 1 && !step1ok) { setError(password.length < 8 ? 'パスワードは8文字以上で設定してください' : 'パスワードが一致しません'); return }
    if (step === 2) {
      const errors: Step2Errors = {
        ...(!lastName.trim() && { lastName: '姓を入力してください' }),
        ...(!firstName.trim() && { firstName: '名を入力してください' }),
        ...(!phone.trim() && { phone: '電話番号を入力してください' }),
        ...(!address.trim() && { address: '住所を入力してください' }),
      }
      setStep2Errors(errors)
      if (Object.keys(errors).length > 0) { setError('必須項目を入力してください'); return }
    }
    if (step === 3 && !step3ok) { setError('振込先口座をすべて入力してください'); return }
    setStep((s) => Math.min(4, s + 1) as Step)
  }
  function back() { setError(''); setStep((s) => Math.max(1, s - 1) as Step) }

  async function submit() {
    if (!step4ok) return
    setLoading(true); setError('')
    const res = await fetch('/api/invite/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token, email, password,
        lastName: lastName.trim(), firstName: firstName.trim(),
        phone: phone.trim(), address: address.trim(),
        taxType, bankName: bankName.trim(), branchName: branchName.trim(), accountType,
        accountNumber: accountNumber.trim(), accountHolder: accountHolder.trim(), invoiceNumber: invoiceNumber.trim(),
        agreeTerms, agreePrivacy,
        frontierFlag, frontierId,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'アカウント作成に失敗しました'); setLoading(false); return }
    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) { setError('アカウントは作成されましたが、ログインに失敗しました。ログインページからお試しください。'); setLoading(false); return }
    setCode(data.code ?? null)
    setDone(true)
  }

  // ── Completion ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
        <div style={{ ...card, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 28px' }}>
          <div className="celebrate-pop" style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.4"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: 8 }}>登録が完了しました</h1>
          <p style={{ fontSize: '.78rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 22 }}>MB Partners へようこそ。<br />あなたのパートナーコードはこちらです。</p>
          {code && (
            <div style={{ background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '16px 28px', marginBottom: 26 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Partner Code</div>
              <div style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '1.5rem', letterSpacing: '.08em', color: 'var(--blue)' }}>{code}</div>
            </div>
          )}
          <button onClick={() => { window.location.href = '/app' }} className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>ダッシュボードへ</button>
        </div>
      </div>
    )
  }

  // ── Wizard ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={card}>
        {/* Header + progress */}
        <div style={{ padding: '28px 26px 16px' }}>
          <svg width="38" height="38" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 14 }}>
            <g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" />
          </svg>
          <h1 style={{ fontSize: '1.12rem', fontWeight: 500, letterSpacing: '-.01em' }}>パートナー登録</h1>
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>STEP {step} / 4 — {STEP_LABELS[step - 1]}</p>
          <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? 'var(--blue)' : 'var(--line)', transition: 'background .3s var(--ease-out)' }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="page-anim" key={step} style={{ flex: 1, overflowY: 'auto', padding: '6px 26px 10px' }}>
          {step === 1 && (
            <>
              <Field label="メールアドレス（ログインに使用）">
                <input value={email} readOnly style={{ ...input, background: 'var(--bg2)', color: 'var(--muted2)' }} />
              </Field>
              <Field label="パスワード（8文字以上）*">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete="new-password" style={input} />
              </Field>
              <Field label="パスワード（確認）*">
                <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••••" autoComplete="new-password" style={input} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Field label="姓 *" error={step2Errors.lastName}>
                    <input aria-invalid={!!step2Errors.lastName} value={lastName} onChange={(e) => { setLastName(e.target.value); clearStep2Error('lastName') }} placeholder="山田" style={{ ...input, borderColor: step2Errors.lastName ? 'var(--red)' : 'var(--line)' }} />
                  </Field>
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="名 *" error={step2Errors.firstName}>
                    <input aria-invalid={!!step2Errors.firstName} value={firstName} onChange={(e) => { setFirstName(e.target.value); clearStep2Error('firstName') }} placeholder="太郎" style={{ ...input, borderColor: step2Errors.firstName ? 'var(--red)' : 'var(--line)' }} />
                  </Field>
                </div>
              </div>
              <Field label="電話番号 *" error={step2Errors.phone}>
                <input aria-invalid={!!step2Errors.phone} value={phone} onChange={(e) => { setPhone(e.target.value); clearStep2Error('phone') }} placeholder="09012345678" inputMode="tel" style={{ ...input, borderColor: step2Errors.phone ? 'var(--red)' : 'var(--line)' }} />
              </Field>
              <Field label="住所 *" error={step2Errors.address}>
                <input aria-invalid={!!step2Errors.address} value={address} onChange={(e) => { setAddress(e.target.value); clearStep2Error('address') }} placeholder="大阪府〇〇市〇〇1-2-3" style={{ ...input, borderColor: step2Errors.address ? 'var(--red)' : 'var(--line)' }} />
              </Field>
              <p style={{ fontSize: '.62rem', color: 'var(--muted)', margin: '-6px 0 0', lineHeight: 1.6 }}>住所は支払調書の発行など税務手続にのみ使用します。</p>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="区分 *">
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['individual', '個人'], ['corporate', '法人']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setTaxType(v)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1.5px solid ${taxType === v ? 'var(--blue)' : 'var(--line)'}`, background: taxType === v ? 'var(--blue-bg2)' : '#fff', color: taxType === v ? 'var(--blue)' : 'var(--txt)', fontWeight: 500, fontSize: '.8rem', cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </Field>
              <BankBranchSelect value={bankDraft} onChange={setBankDraft} />
              <Field label="種別 *">
                <div style={{ display: 'flex', gap: 8 }}>
                  {['普通', '当座'].map((v) => (
                    <button key={v} type="button" onClick={() => setAccountType(v)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1.5px solid ${accountType === v ? 'var(--blue)' : 'var(--line)'}`, background: accountType === v ? 'var(--blue-bg2)' : '#fff', color: accountType === v ? 'var(--blue)' : 'var(--txt)', fontWeight: 500, fontSize: '.8rem', cursor: 'pointer' }}>{v}</button>
                  ))}
                </div>
              </Field>
              <Field label="口座番号 *"><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="1234567" inputMode="numeric" style={input} /></Field>
              <Field label="口座名義（カナ）*"><input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="ヤマダ タロウ" style={input} /></Field>
              <Field label="インボイス登録番号（任意・後から追加可）"><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="T0000000000000" style={input} /></Field>
            </>
          )}

          {step === 4 && (
            <>
              <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                {[
                  ['お名前', `${lastName} ${firstName}`],
                  ['メール', email],
                  ['電話番号', phone],
                  ['住所', address],
                  ['区分', taxType === 'individual' ? '個人' : '法人'],
                  ['振込先', `${bankName} ${branchName} ${accountType} ${accountNumber}`],
                  ['口座名義', accountHolder],
                  ['インボイス', invoiceNumber || '未登録'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: '.72rem' }}>
                    <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              </div>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 0', fontSize: '.74rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 16, height: 16 }} />
                {/* B: プライバシーポリシーと同形式の文中リンクに統一（「利用規約を読む」ボタン風リンクは削除） */}
                <span><a href={`/legal/terms?kind=${frontierFlag ? 'frontier' : 'partner'}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline' }}>利用規約</a>に同意します</span>
              </label>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 0', fontSize: '.74rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 16, height: 16 }} />
                <span><a href={`/legal/privacy?kind=${frontierFlag ? 'frontier' : 'partner'}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline' }}>プライバシーポリシー</a>に同意します</span>
              </label>
            </>
          )}

          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 8 }}>{error}</p>}
        </div>

        {/* Footer nav */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 26px 26px', borderTop: '1px solid var(--line)' }}>
          {step > 1 && <button onClick={back} className="btn btn-g" style={{ flex: '0 0 96px', justifyContent: 'center' }} disabled={loading}>戻る</button>}
          {step < 4 ? (
            <button onClick={next} className="btn btn-p" style={{ flex: 1, justifyContent: 'center' }}>次へ</button>
          ) : (
            <button onClick={submit} className="btn btn-p" style={{ flex: 1, justifyContent: 'center' }} disabled={!step4ok || loading}>
              {loading ? '登録中…' : '登録を完了する'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
