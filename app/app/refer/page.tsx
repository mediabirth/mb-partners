'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'
import { getOrCreateReferralToken, submitPartnerReferral, getPartnerInfo } from './actions'

type Step = 'service' | 'menu' | 'form'

function fmtRefAmount(m: MenuRow) {
  if (m.ref_type === 'fixed') return `¥${Number(m.ref_value).toLocaleString()}`
  return `${m.ref_value}%${m.ref_base ? ` (${m.ref_base})` : ''}`
}

function RefChip({ name }: { name: string }) {
  return (
    <span style={{
      display: 'inline-flex', fontSize: '.55rem', fontWeight: 700,
      padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap',
      background: 'var(--blue-bg)', color: 'var(--blue)',
    }}>
      {name}
    </span>
  )
}

function CoopBadge() {
  return (
    <span style={{
      display: 'inline-flex', fontSize: '.55rem', fontWeight: 700,
      padding: '3px 8px', borderRadius: 10, whiteSpace: 'nowrap',
      background: '#EBEBF0', color: 'var(--txt)',
    }}>
      協力
    </span>
  )
}

export default function ReferPage() {
  const router = useRouter()
  const [services, setServices]           = useState<ServiceWithMenus[]>([])
  const [step, setStep]                   = useState<Step>('service')
  const [selSvc, setSelSvc]               = useState<ServiceWithMenus | null>(null)
  const [selMenu, setSelMenu]             = useState<MenuRow | null>(null)
  const [coopMode, setCoopMode]           = useState(false)
  const [customerName, setCustomerName]   = useState('')
  const [phone, setPhone]                 = useState('')
  const [memo, setMemo]                   = useState('')
  const [consent, setConsent]             = useState(false)
  const [token, setToken]                 = useState<string | null>(null)
  const [partnerCode, setPartnerCode]     = useState<string | null>(null)
  const [copied, setCopied]               = useState(false)
  const [bookingCopied, setBookingCopied] = useState(false)
  const [showQR, setShowQR]               = useState(false)
  const [pending, startTransition]        = useTransition()
  const [done, setDone]                   = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    fetch('/api/services').then(r => r.json()).then(setServices)
    startTransition(async () => {
      try { setPartnerCode((await getPartnerInfo()).code) } catch { /* silent */ }
    })
  }, [])

  function pickService(svc: ServiceWithMenus) {
    setSelSvc(svc)
    setSelMenu(null)
    setCoopMode(false)
    const refMenus = svc.service_menus // all are referral now
    const hasCoop  = svc.coop_enabled

    if (refMenus.length === 0 && !hasCoop) {
      loadToken(svc.id); setStep('form')
    } else if (refMenus.length === 0 && hasCoop) {
      setCoopMode(true); setStep('form')
    } else if (refMenus.length === 1 && !hasCoop) {
      setSelMenu(refMenus[0]); loadToken(svc.id); setStep('form')
    } else {
      setStep('menu')
    }
  }

  function pickMenu(m: MenuRow) {
    setSelMenu(m); setCoopMode(false); loadToken(selSvc!.id); setStep('form')
  }

  function pickCoop() {
    setSelMenu(null); setCoopMode(true); setStep('form')
  }

  function loadToken(serviceId: string) {
    startTransition(async () => {
      try { setToken(await getOrCreateReferralToken(serviceId)) } catch { /* silent */ }
    })
  }

  function copyLink() {
    navigator.clipboard?.writeText(`${location.origin}/r/${token}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  function copyBooking() {
    navigator.clipboard?.writeText(`${location.origin}/book/${partnerCode}`).then(() => {
      setBookingCopied(true); setTimeout(() => setBookingCopied(false), 2000)
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
    fd.set('channel', coopMode ? 'cooperation' : 'referral')
    startTransition(async () => {
      try {
        await submitPartnerReferral(fd)
        setDone(true)
        setTimeout(() => router.push('/app/cases'), 1800)
      } catch (err: any) { setError(err.message ?? '登録に失敗しました') }
    })
  }

  const linkUrl    = token       ? `${location.origin}/r/${token}` : ''
  const bookingUrl = partnerCode ? `${location.origin}/book/${partnerCode}` : ''

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, padding: 40, textAlign: 'center' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
          <circle cx="12" cy="12" r="10" stroke="var(--blue)" strokeWidth="2"/>
          <path d="M7 12l3.5 3.5L17 8" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 8 }}>登録しました</h2>
        <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>案件ページへ移動します…</p>
      </div>
    )
  }

  return (
    <div>
      {/* ── Step 1: Service ─────────────────────────────────── */}
      {step === 'service' && (
        <div>
          <div style={{ padding: '22px 20px 6px' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Step 1 / 2</div>
            <h2 style={{ fontSize: '.9rem', fontWeight: 700 }}>どのサービスの案件ですか?</h2>
          </div>
          <div className="stagger" style={{ padding: '0 20px' }}>
            {services.map(svc => (
              <button key={svc.id} onClick={() => pickService(svc)} className="card-hover"
                style={{ width: '100%', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '13px 15px', marginBottom: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left', fontFamily: 'inherit' }}>
                <ServiceIcon icon={svc.icon} color={svc.color} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{svc.name}</div>
                  {svc.subtitle && (
                    <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1 }}>{svc.subtitle}</div>
                  )}
                  {/* 紹介メニュー名チップ + 協力バッジ */}
                  {(svc.service_menus.length > 0 || svc.coop_enabled) && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                      {svc.service_menus.map(m => <RefChip key={m.id} name={m.name} />)}
                      {svc.coop_enabled && <CoopBadge />}
                    </div>
                  )}
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Menu / Coop selection ───────────────────── */}
      {step === 'menu' && selSvc && (
        <div>
          <button onClick={() => setStep('service')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← サービス選択
          </button>
          <div style={{ padding: '10px 20px 6px' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{selSvc.name}</div>
            <h2 style={{ fontSize: '.9rem', fontWeight: 700 }}>どのかたちで関わりますか?</h2>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {/* Referral menu cards */}
            {selSvc.service_menus.map(m => {
              const covSteps = (m.coverage_steps ?? []).filter((s: { label: string; included: boolean }) => s.included)
              return (
                <button key={m.id} onClick={() => pickMenu(m)}
                  style={{ width: '100%', background: '#fff', textAlign: 'left', fontFamily: 'inherit', border: '1.5px solid var(--line)', borderRadius: 15, padding: '16px 17px', marginBottom: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: 'var(--blue-bg)', color: 'var(--blue)' }}>紹介</span>
                      <span style={{ fontSize: '.9rem', fontWeight: 900 }}>{m.name}</span>
                    </div>
                    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.2rem', color: 'var(--blue)', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                      {fmtRefAmount(m)}
                    </span>
                  </div>
                  {m.ref_trigger && (
                    <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '0 0 6px', lineHeight: 1.6 }}>{m.ref_trigger}</p>
                  )}
                  {covSteps.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                      {covSteps.map((s: { label: string }) => (
                        <span key={s.label} style={{ fontSize: '.58rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue)' }}>{s.label}</span>
                      ))}
                    </div>
                  )}
                  {m.qualification && (
                    <p style={{ fontSize: '.64rem', color: 'var(--amber)', margin: '0 0 6px', lineHeight: 1.5 }}>⚠ {m.qualification}</p>
                  )}
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    選択する <span>›</span>
                  </div>
                </button>
              )
            })}

            {/* Cooperation card (service-level) */}
            {selSvc.coop_enabled && (() => {
              const covSteps = (selSvc.coverage_steps ?? []).filter(s => s.included)
              const coopAmt = selSvc.coop_rate
                ? `${selSvc.coop_rate}%${selSvc.coop_base ? ` (${selSvc.coop_base})` : ''}`
                : '-'
              return (
                <button onClick={pickCoop}
                  style={{ width: '100%', background: '#fff', textAlign: 'left', fontFamily: 'inherit', border: '1.5px solid var(--line)', borderRadius: 15, padding: '16px 17px', marginBottom: 12, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: '#EBEBF0', color: 'var(--txt)' }}>協力</span>
                      <span style={{ fontSize: '.9rem', fontWeight: 900 }}>協力パートナー</span>
                    </div>
                    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.2rem', color: 'var(--txt)', fontFeatureSettings: '"tnum"', flexShrink: 0 }}>
                      {coopAmt}
                    </span>
                  </div>
                  {selSvc.ft_trigger && (
                    <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '0 0 8px', lineHeight: 1.6 }}>{selSvc.ft_trigger}</p>
                  )}
                  {covSteps.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                      {covSteps.map((s: { label: string }) => (
                        <span key={s.label} style={{ fontSize: '.58rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#F0F0F4', color: 'var(--txt)' }}>{s.label}</span>
                      ))}
                    </div>
                  )}
                  {selSvc.ft_condition && (
                    <p style={{ fontSize: '.64rem', color: 'var(--amber)', margin: '0 0 8px', lineHeight: 1.5 }}>⚠ {selSvc.ft_condition}</p>
                  )}
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    選択する <span>›</span>
                  </div>
                </button>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Step 3: Form ─────────────────────────────────────── */}
      {step === 'form' && selSvc && (
        <div>
          <button onClick={() => {
            const hasMultiple = selSvc.service_menus.length > 1 || (selSvc.service_menus.length > 0 && selSvc.coop_enabled)
            setStep(hasMultiple ? 'menu' : 'service')
          }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← 戻る
          </button>
          <div style={{ padding: '10px 20px 6px' }}>
            <div className="eyebrow">{selSvc.name}{selMenu ? ` — ${selMenu.name}` : coopMode ? ' — 協力' : ''}</div>
            <h2 style={{ fontSize: '.9rem', fontWeight: 700, marginTop: 6 }}>
              {coopMode ? '協力として申し込む' : '紹介する'}
            </h2>
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
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={coopMode ? '担当可能なエリア・スケジュール等' : '7月に引越し希望 など'} />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 15, height: 15 }}/>
                <label htmlFor="consent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}>
                  <b>{coopMode ? '本人として協力を申し込みます' : 'ご本人の同意を確認済みです'}（必須）</b>
                </label>
              </div>
              {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
              <button type="submit" disabled={pending || !consent} className="btn btn-p" style={{ width: '100%' }}>
                {pending ? '登録中...' : (coopMode ? '協力を申し込む' : '紹介を登録する')}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
              </button>
            </form>

            {/* ── 紹介: 共有リンク + QR ── */}
            {!coopMode && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
                <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 10, lineHeight: 1.6 }}>
                  リンクを共有して顧客自身に登録してもらうこともできます。
                </p>
                {token ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: '11px 12px', marginBottom: 8 }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.7rem', fontFamily: 'Inter', fontWeight: 600 }}>
                        {linkUrl.replace(/^https?:\/\//, '')}
                      </span>
                      <button onClick={copyLink} style={{ fontFamily: 'Inter', fontSize: '.55rem', letterSpacing: '.1em', background: copied ? 'var(--green)' : 'var(--txt)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
                        {copied ? 'COPIED' : 'COPY'}
                      </button>
                    </div>
                    <button onClick={() => setShowQR(v => !v)} className="btn btn-g" style={{ width: '100%', marginTop: 0 }}>
                      QRコード
                    </button>
                    {showQR && <QRModal linkUrl={linkUrl} onClose={() => setShowQR(false)} />}
                  </>
                ) : (
                  <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>リンクを生成中…</p>
                )}
              </div>
            )}

            {/* ── 協力: 商談予約リンク ── */}
            {coopMode && bookingUrl && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px dashed var(--line)' }}>
                <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 10, lineHeight: 1.6 }}>
                  あなたの商談予約ページを顧客に共有して日程を調整できます。
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: '11px 12px', marginBottom: 8 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.7rem', fontFamily: 'Inter', fontWeight: 600 }}>
                    {bookingUrl.replace(/^https?:\/\//, '')}
                  </span>
                  <button onClick={copyBooking} style={{ fontFamily: 'Inter', fontSize: '.55rem', letterSpacing: '.1em', background: bookingCopied ? 'var(--green)' : 'var(--txt)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
                    {bookingCopied ? 'COPIED' : 'COPY'}
                  </button>
                </div>
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
                  className="btn btn-g" style={{ display: 'flex', width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
                  商談カレンダーを開く →
                </a>
              </div>
            )}
          </div>
          <div style={{ height: 24 }} />
        </div>
      )}
    </div>
  )
}

function QRModal({ linkUrl, onClose }: { linkUrl: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const N = 25, S = c.width / N
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#0E0E14'
    let seed = 0
    for (const ch of linkUrl) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
    function rnd() { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967295 }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (rnd() > 0.52) ctx.fillRect(i * S, j * S, S - 1, S - 1)
    function eye(px: number, py: number) {
      ctx!.fillStyle = '#0E0E14'; ctx!.fillRect(px, py, S * 7, S * 7)
      ctx!.fillStyle = '#fff';    ctx!.fillRect(px + S, py + S, S * 5, S * 5)
      ctx!.fillStyle = '#4733E6'; ctx!.fillRect(px + S * 2, py + S * 2, S * 3, S * 3)
    }
    eye(0, 0); eye(c.width - S * 7, 0); eye(0, c.height - S * 7)
  }, [linkUrl])

  function saveQR() {
    const c = canvasRef.current; if (!c) return
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png'); a.download = 'MB_Partners_QR.png'; a.click()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <h3 style={{ fontSize: '.92rem', fontWeight: 900, marginBottom: 4 }}>あなたの紹介QRコード</h3>
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginBottom: 14 }}>{linkUrl.replace(/^https?:\/\//, '')}</p>
        <canvas ref={canvasRef} width={220} height={220} style={{ border: '1px solid var(--line)', borderRadius: 12, marginBottom: 14 }} />
        <button onClick={saveQR} className="btn btn-p" style={{ width: '100%', padding: 11, fontSize: '.76rem' }}>
          保存する <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
        </button>
        <div onClick={onClose} style={{ marginTop: 8, fontSize: '.7rem', color: 'var(--muted2)', cursor: 'pointer', fontWeight: 500 }}>閉じる</div>
      </div>
    </div>
  )
}
