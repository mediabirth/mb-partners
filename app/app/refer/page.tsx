'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'
import ServiceAvatar from '@/components/ServiceAvatar'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'
import { getOrCreateReferralToken, submitPartnerReferral, getPartnerInfo } from './actions'

type Step = 'service' | 'menu' | 'form'

function fmtRefAmount(m: MenuRow) {
  if (m.ref_type === 'fixed') return `¥${Number(m.ref_value).toLocaleString()}`
  return `${m.ref_value}%${m.ref_base ? ` (${m.ref_base})` : ''}`
}

function fmtCoopAmount(m: MenuRow) {
  if (m.coop_type === 'fixed') return `¥${Number(m.coop_value ?? 0).toLocaleString()}`
  if (m.coop_type === 'rate')  return `${m.coop_value ?? 0}%${m.coop_base ? ` (${m.coop_base})` : ''}`
  return '-'
}

function RefChip({ name }: { name: string }) {
  return <span className="chip chip-referral">{name}</span>
}

function CoopBadge() {
  return <span className="chip chip-cooperation">協力</span>
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
    const refMenus  = svc.service_menus.filter(m => m.ref_enabled !== false)
    const coopMenus = svc.service_menus.filter(m => m.coop_enabled === true)
    const total     = refMenus.length + coopMenus.length

    if (total === 0) {
      // no per-menu engagement options — server falls back to service-level
      loadToken(svc.id); setStep('form')
    } else if (total === 1 && refMenus.length === 1) {
      setSelMenu(refMenus[0]); loadToken(svc.id); setStep('form')
    } else if (total === 1 && coopMenus.length === 1) {
      pickCoop(coopMenus[0])
    } else {
      setStep('menu')
    }
  }

  function pickMenu(m: MenuRow) {
    setSelMenu(m); setCoopMode(false); loadToken(selSvc!.id); setStep('form')
  }

  // 協力 is per-menu now: selecting a 協力 option must set selMenu (so deal records menu_id)
  // AND coopMode=true (so channel='cooperation'). Do NOT change handleSubmit.
  function pickCoop(m: MenuRow) {
    setSelMenu(m); setCoopMode(true); setStep('form')
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
        <div className="page-anim">
          <div style={{ padding: '22px 20px 10px' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Step 1 / 2</div>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 900, letterSpacing: '-.01em' }}>どのサービスの案件ですか?</h2>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>
              関われるかたちと報酬がひと目でわかります。
            </p>
          </div>
          <div className="stagger" style={{ padding: '0 20px' }}>
            {services.map(svc => {
              // 紹介報酬のヘッドライン: メニューの最大報酬を代表値として表示
              const refMenus = svc.service_menus
              const topMenu = refMenus.length
                ? [...refMenus].sort((a, b) => Number(b.ref_value) - Number(a.ref_value))[0]
                : null
              const coopAmt = svc.coop_enabled && svc.coop_rate
                ? `${svc.coop_rate}%${svc.coop_base ? ` (${svc.coop_base})` : ''}`
                : null
              return (
                <button key={svc.id} onClick={() => pickService(svc)} className="card-hover"
                  style={{ width: '100%', background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '15px 16px 14px', marginBottom: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden', position: 'relative' }}>
                  {/* Header: icon + name + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={42} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.92rem', fontWeight: 900, letterSpacing: '-.01em' }}>{svc.name}</div>
                      {svc.subtitle && (
                        <div style={{ fontSize: '.63rem', color: 'var(--muted2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.subtitle}</div>
                      )}
                    </div>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg2)', color: 'var(--muted)', fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>›</span>
                  </div>

                  {/* 関わり方 × 報酬: ひと目でわかる reward rail */}
                  {(topMenu || coopAmt) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap' }}>
                      {topMenu && (
                        <div style={{ flex: '1 1 130px', minWidth: 120, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 11, padding: '9px 11px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span className="chip chip-referral">紹介</span>
                            {refMenus.length > 1 && (
                              <span style={{ fontSize: '.54rem', fontWeight: 700, color: 'var(--blue)', opacity: .8 }}>{refMenus.length}メニュー</span>
                            )}
                          </div>
                          <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.18rem', color: 'var(--blue)', marginTop: 6, lineHeight: 1, whiteSpace: 'nowrap' }}>
                            {refMenus.length > 1 && <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginRight: 3 }}>最大</span>}
                            {fmtRefAmount(topMenu)}
                          </div>
                        </div>
                      )}
                      {coopAmt && (
                        <div style={{ flex: '1 1 130px', minWidth: 120, background: '#F4F3FA', border: '1px solid #E7E4F7', borderRadius: 11, padding: '9px 11px' }}>
                          <span className="chip chip-cooperation">協力</span>
                          <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.18rem', color: 'var(--blue-dk)', marginTop: 6, lineHeight: 1, whiteSpace: 'nowrap' }}>
                            {coopAmt}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Step 2: Menu / Coop selection ───────────────────── */}
      {step === 'menu' && selSvc && (
        <div className="page-anim">
          <button onClick={() => setStep('service')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ← サービス選択
          </button>
          <div style={{ padding: '10px 20px 8px' }}>
            <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <ServiceIcon icon={selSvc.icon} color={selSvc.color} size={20} />
              {selSvc.name}
            </div>
            <h2 style={{ fontSize: '1.02rem', fontWeight: 900, letterSpacing: '-.01em' }}>どのかたちで関わりますか?</h2>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>
              関わり方によって報酬と役割が変わります。
            </p>
          </div>
          <div className="stagger" style={{ padding: '0 20px 20px' }}>
            {/* Referral menu cards — 紹介 = 青 (per-menu ref_enabled) */}
            {selSvc.service_menus.filter(m => m.ref_enabled !== false).map(m => {
              const covSteps = (m.coverage_steps ?? []).filter((s: { label: string; included: boolean }) => s.included)
              return (
                <button key={m.id} onClick={() => pickMenu(m)} className="card-hover"
                  style={{ width: '100%', background: '#fff', textAlign: 'left', fontFamily: 'inherit', border: '1.5px solid var(--blue-bg)', borderRadius: 16, padding: 0, marginBottom: 13, cursor: 'pointer', overflow: 'hidden' }}>
                  {/* Reward banner */}
                  <div style={{ background: 'var(--blue-bg2)', borderBottom: '1px solid var(--blue-bg)', padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="chip chip-referral">紹介</span>
                      <div style={{ fontSize: '.92rem', fontWeight: 900, marginTop: 7, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--blue)', opacity: .75, letterSpacing: '.06em' }}>REWARD</div>
                      <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.42rem', color: 'var(--blue)', lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                        {fmtRefAmount(m)}
                      </div>
                    </div>
                  </div>
                  {/* Body */}
                  <div style={{ padding: '13px 16px 14px' }}>
                    {m.ref_trigger && (
                      <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '0 0 8px', lineHeight: 1.6 }}>{m.ref_trigger}</p>
                    )}
                    {covSteps.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                        {covSteps.map((s: { label: string }) => (
                          <span key={s.label} style={{ fontSize: '.58rem', fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue)' }}>{s.label}</span>
                        ))}
                      </div>
                    )}
                    {m.qualification && (
                      <p style={{ fontSize: '.64rem', color: 'var(--amber)', margin: '0 0 8px', lineHeight: 1.5 }}>⚠ {m.qualification}</p>
                    )}
                    <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>このかたちで紹介する</span>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</span>
                    </div>
                  </div>
                </button>
              )
            })}

            {/* Cooperation menu cards (per-menu coop_enabled) — 協力 = 濃色 */}
            {selSvc.service_menus.filter(m => m.coop_enabled === true).map(m => {
              const covSteps = (m.coop_coverage ?? []).filter((s: { label: string; included: boolean }) => s.included)
              return (
                <button key={`coop-${m.id}`} onClick={() => pickCoop(m)} className="card-hover"
                  style={{ width: '100%', background: '#fff', textAlign: 'left', fontFamily: 'inherit', border: '1.5px solid #E7E4F7', borderRadius: 16, padding: 0, marginBottom: 13, cursor: 'pointer', overflow: 'hidden' }}>
                  {/* Reward banner */}
                  <div style={{ background: '#F4F3FA', borderBottom: '1px solid #E7E4F7', padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="chip chip-cooperation">協力</span>
                      <div style={{ fontSize: '.92rem', fontWeight: 900, marginTop: 7, letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--blue-dk)', opacity: .7, letterSpacing: '.06em' }}>REWARD</div>
                      <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.42rem', color: 'var(--blue-dk)', lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                        {fmtCoopAmount(m)}
                      </div>
                    </div>
                  </div>
                  {/* Body */}
                  <div style={{ padding: '13px 16px 14px' }}>
                    {covSteps.length > 0 && (
                      <>
                        <div style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.04em', marginBottom: 5 }}>対応範囲</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                          {covSteps.map((s: { label: string }) => (
                            <span key={s.label} style={{ fontSize: '.58rem', fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: '#ECE9F8', color: 'var(--blue-dk)' }}>{s.label}</span>
                          ))}
                        </div>
                      </>
                    )}
                    {m.coop_condition && (
                      <p style={{ fontSize: '.64rem', color: 'var(--amber)', margin: '0 0 8px', lineHeight: 1.5 }}>⚠ {m.coop_condition}</p>
                    )}
                    <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--blue-dk)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>このかたちで協力する</span>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#ECE9F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Step 3: Form ─────────────────────────────────────── */}
      {step === 'form' && selSvc && (
        <div>
          <button onClick={() => {
            const optionCount = selSvc.service_menus.filter(m => m.ref_enabled !== false).length
              + selSvc.service_menus.filter(m => m.coop_enabled === true).length
            setStep(optionCount > 1 ? 'menu' : 'service')
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
