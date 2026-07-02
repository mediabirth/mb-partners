'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 1 | 2 | 3 | 4
const STEP_LABELS = ['アカウント', '基本情報', '報酬受取', '確認と同意']
// ⑤メジャーバンク（プルダウン）。無い場合は「その他」で自由入力。支店は自由入力（次段で銀行連動候補）。
const MAJOR_BANKS = ['三菱UFJ銀行', '三井住友銀行', 'みずほ銀行', 'りそな銀行', 'ゆうちょ銀行', '楽天銀行', '住信SBIネット銀行', 'PayPay銀行', 'イオン銀行', 'GMOあおぞらネット銀行']

const card: React.CSSProperties = { width: '100%', maxWidth: 430, background: '#fff', minHeight: '100vh', boxShadow: '0 0 48px rgba(14,14,20,.10)', display: 'flex', flexDirection: 'column' }
const input: React.CSSProperties = { width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.86rem', color: 'var(--txt)', background: '#fff' }
const lbl: React.CSSProperties = { display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 5 }

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <div style={{ marginBottom: 13 }}><span style={lbl}>{label}</span>{children}</div>
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
  // STEP3
  const [taxType, setTaxType] = useState<'individual' | 'corporate'>('individual')
  // ⑤銀行：メジャーバンクをプルダウン、「その他」で自由入力。
  const [bankChoice, setBankChoice] = useState('')
  const [bankOther, setBankOther] = useState('')
  const bankName = bankChoice === '__other__' ? bankOther : bankChoice
  const [branchName, setBranchName] = useState('')
  const [accountType, setAccountType] = useState('普通')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  // STEP4
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)

  const step1ok = password.length >= 8 && password === passwordConfirm
  const step2ok = !!lastName.trim() && !!firstName.trim() && !!phone.trim()
  const step3ok = !!bankName.trim() && !!branchName.trim() && !!accountNumber.trim() && !!accountHolder.trim()
  const step4ok = agreeTerms && agreePrivacy

  function next() {
    setError('')
    if (step === 1 && !step1ok) { setError(password.length < 8 ? 'パスワードは8文字以上で設定してください' : 'パスワードが一致しません'); return }
    if (step === 2 && !step2ok) { setError('必須項目を入力してください'); return }
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
        phone: phone.trim(),
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
          <h1 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 8 }}>登録が完了しました</h1>
          <p style={{ fontSize: '.78rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 22 }}>MB Partners へようこそ。<br />あなたのパートナーコードはこちらです。</p>
          {code && (
            <div style={{ background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '16px 28px', marginBottom: 26 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Partner Code</div>
              <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '.08em', color: 'var(--blue)' }}>{code}</div>
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
            <rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="2.6" />
            <rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="2.6" />
            <rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="2.6" />
            <rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6" />
          </svg>
          <h1 style={{ fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-.01em' }}>パートナー登録</h1>
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
                <div style={{ flex: 1 }}><Field label="姓 *"><input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="山田" style={input} /></Field></div>
                <div style={{ flex: 1 }}><Field label="名 *"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="太郎" style={input} /></Field></div>
              </div>
              <Field label="電話番号 *"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09012345678" inputMode="tel" style={input} /></Field>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="区分 *">
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['individual', '個人'], ['corporate', '法人']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setTaxType(v)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1.5px solid ${taxType === v ? 'var(--blue)' : 'var(--line)'}`, background: taxType === v ? 'var(--blue-bg2)' : '#fff', color: taxType === v ? 'var(--blue)' : 'var(--txt)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </Field>
              <Field label="銀行 *">
                <select value={bankChoice} onChange={(e) => setBankChoice(e.target.value)} style={input}>
                  <option value="">選択してください</option>
                  {MAJOR_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  <option value="__other__">その他（自由入力）</option>
                </select>
                {bankChoice === '__other__' && (
                  <input value={bankOther} onChange={(e) => setBankOther(e.target.value)} placeholder="例：〇〇信用金庫" style={{ ...input, marginTop: 8 }} />
                )}
              </Field>
              <Field label="支店 *"><input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="例：渋谷支店" style={input} /></Field>
              <Field label="種別 *">
                <div style={{ display: 'flex', gap: 8 }}>
                  {['普通', '当座'].map((v) => (
                    <button key={v} type="button" onClick={() => setAccountType(v)} style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1.5px solid ${accountType === v ? 'var(--blue)' : 'var(--line)'}`, background: accountType === v ? 'var(--blue-bg2)' : '#fff', color: accountType === v ? 'var(--blue)' : 'var(--txt)', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>{v}</button>
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
                  ['区分', taxType === 'individual' ? '個人' : '法人'],
                  ['振込先', `${bankName} ${branchName} ${accountType} ${accountNumber}`],
                  ['口座名義', accountHolder],
                  ['インボイス', invoiceNumber || '未登録'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: '.72rem' }}>
                    <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{k}</span>
                    <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                ))}
              </div>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 0', fontSize: '.74rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 16, height: 16 }} />
                <span>利用規約に同意します　<a href={`/legal/terms?kind=${frontierFlag ? 'frontier' : 'partner'}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline', fontWeight: 700 }}>利用規約を読む</a></span>
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
