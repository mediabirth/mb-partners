'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'
import { getOrCreateReferralToken, submitPartnerReferral } from './actions'

type Step = 'service' | 'menu' | 'form'

export default function ReferPage() {
  const router = useRouter()
  const [services, setServices]       = useState<ServiceWithMenus[]>([])
  const [step, setStep]               = useState<Step>('service')
  const [selSvc, setSelSvc]           = useState<ServiceWithMenus | null>(null)
  const [selMenu, setSelMenu]         = useState<MenuRow | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone]             = useState('')
  const [memo, setMemo]               = useState('')
  const [consent, setConsent]         = useState(false)
  const [token, setToken]             = useState<string | null>(null)
  const [copied, setCopied]           = useState(false)
  const [showQR, setShowQR]           = useState(false)
  const [pending, startTransition]    = useTransition()
  const [done, setDone]               = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    fetch('/api/services').then(r => r.json()).then(setServices)
  }, [])

  function pickService(svc: ServiceWithMenus) {
    setSelSvc(svc)
    if (svc.service_menus.length === 1) {
      setSelMenu(svc.service_menus[0])
      loadToken(svc.id)
      setStep('form')
    } else {
      setStep('menu')
    }
  }

  function pickMenu(m: MenuRow) {
    setSelMenu(m)
    loadToken(selSvc!.id)
    setStep('form')
  }

  function loadToken(serviceId: string) {
    startTransition(async () => {
      try {
        const t = await getOrCreateReferralToken(serviceId)
        setToken(t)
      } catch { /* silent */ }
    })
  }

  function copyLink() {
    const url = `${location.origin}/r/${token}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!customerName) { setError('お名前を入力してください'); return }
    if (!consent)       { setError('顧客の同意確認が必要です'); return }

    const fd = new FormData()
    fd.set('serviceId', selSvc!.id)
    fd.set('menuId', selMenu?.id ?? '')
    fd.set('customerName', customerName)
    fd.set('phone', phone)
    fd.set('memo', memo)

    startTransition(async () => {
      try {
        await submitPartnerReferral(fd)
        setDone(true)
        setTimeout(() => router.push('/app/cases'), 1800)
      } catch (err: any) {
        setError(err.message ?? '登録に失敗しました')
      }
    })
  }

  const linkUrl = token ? `${typeof window !== 'undefined' ? location.origin : ''}/r/${token}` : ''

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, padding: 40, textAlign: 'center' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
          <circle cx="12" cy="12" r="10" stroke="var(--blue)" strokeWidth="2"/>
          <path d="M7 12l3.5 3.5L17 8" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 8 }}>登録しました</h2>
        <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
          案件ページへ移動します…
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Step 1: Service */}
      {step === 'service' && (
        <div>
          <div style={{ padding: '22px 20px 6px' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Step 1 / 2</div>
            <h2 style={{ fontSize: '.9rem', fontWeight: 700 }}>どのサービスの案件ですか?</h2>
          </div>
          <div style={{ padding: '0 20px' }}>
            {services.map(svc => (
              <button key={svc.id} onClick={() => pickService(svc)}
                style={{
                  width: '100%', background: '#fff', border: '1px solid var(--line)',
                  borderRadius: 13, padding: '13px 15px', marginBottom: 9,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13,
                  textAlign: 'left', fontFamily: 'inherit',
                }}>
                <ServiceIcon icon={svc.icon} color={svc.color} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{svc.name}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1 }}>{svc.subtitle}</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Menu */}
      {step === 'menu' && selSvc && (
        <div>
          <button onClick={() => setStep('service')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← サービス選択
          </button>
          <div style={{ padding: '10px 20px 6px' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{selSvc.name} — Step 2 / 2</div>
            <h2 style={{ fontSize: '.9rem', fontWeight: 700 }}>どこまで関わりますか?</h2>
          </div>
          <div style={{ padding: '0 20px' }}>
            {selSvc.service_menus.map(m => (
              <button key={m.id} onClick={() => pickMenu(m)}
                style={{
                  width: '100%', background: '#fff', border: '1.5px solid var(--line)',
                  borderRadius: 15, padding: '17px', marginBottom: 12,
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ fontSize: '.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: 'var(--blue-bg)', color: 'var(--blue)' }}>紹介</span>
                    {m.name}
                  </h3>
                  <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.3rem', color: 'var(--blue)', fontFeatureSettings: '"tnum"' }}>
                    {m.ref_type === 'fixed' ? `¥${Number(m.ref_value).toLocaleString()}` : `${m.ref_value}%`}
                    <small style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', marginLeft: 6, fontFamily: 'inherit' }}>
                      {m.ref_type === 'fixed' ? '固定' : 'レート'}
                    </small>
                  </span>
                </div>
                {m.example_ref && <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{m.example_ref}</p>}
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 11 }}>
                  選択する <span>›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Form + Link */}
      {step === 'form' && selSvc && (
        <div>
          <button onClick={() => setStep(selSvc.service_menus.length > 1 ? 'menu' : 'service')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← 戻る
          </button>
          <div style={{ padding: '10px 20px 6px' }}>
            <div className="eyebrow">{selSvc.name}</div>
            <h2 style={{ fontSize: '.9rem', fontWeight: 700, marginTop: 6 }}>紹介する</h2>
          </div>

          <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 18px 20px' }}>
            <form onSubmit={handleSubmit}>
              <div className="fld">
                <label>お名前 *</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" required />
              </div>
              <div className="fld">
                <label>連絡先</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-XXXX-XXXX" />
              </div>
              <div className="fld">
                <label>メモ(任意)</label>
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="7月に引越し希望 など" />
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 15, height: 15 }}/>
                <label htmlFor="consent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}>
                  <b>ご本人の同意を確認済みです</b>（必須）
                </label>
              </div>

              {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}

              <button type="submit" disabled={pending || !consent}
                className="btn btn-p" style={{ width: '100%' }}>
                {pending ? '登録中...' : '紹介を登録する'}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
              </button>
            </form>

            {/* Referral link section */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
              <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 10, lineHeight: 1.6 }}>
                リンクを共有して顧客自身に登録してもらうこともできます。
              </p>
              {token ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: '11px 12px', marginBottom: 8 }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.7rem', fontFamily: 'Inter', fontWeight: 600 }}>
                      {linkUrl}
                    </span>
                    <button onClick={copyLink}
                      style={{ fontFamily: 'Inter', fontSize: '.55rem', letterSpacing: '.1em', background: copied ? 'var(--green)' : 'var(--txt)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
                      {copied ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <button onClick={() => setShowQR(v => !v)}
                    className="btn btn-g" style={{ width: '100%', marginTop: 0 }}>
                    QRコードを表示
                  </button>
                  {showQR && (
                    <div style={{ marginTop: 12, textAlign: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkUrl + '?via=qr')}`}
                        alt="QR Code"
                        width={180} height={180}
                        style={{ border: '1px solid var(--line)', borderRadius: 12 }}
                      />
                      <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 8 }}>
                        このQRコードをスクリーンショットまたはスキャンして共有できます。
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>リンクを生成中…</p>
              )}
            </div>
          </div>

          <div style={{ height: 24 }} />
        </div>
      )}
    </div>
  )
}
