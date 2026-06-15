'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ServiceAvatar from '@/components/ServiceAvatar'
import BookingDrawer from '@/components/BookingDrawer'
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

// 報酬ハイライト用の自然文（協力の料率は「粗利の50%」形式）
function rewardHighlight(m: MenuRow | null, coop: boolean): string {
  if (!m) return ''
  if (coop) {
    if (m.coop_type === 'fixed') return `¥${Number(m.coop_value ?? 0).toLocaleString()}`
    if (m.coop_type === 'rate')  return `${m.coop_base ?? '売上'}の${m.coop_value ?? 0}%`
    return ''
  }
  if (m.ref_type === 'fixed') return `¥${Number(m.ref_value).toLocaleString()}`
  return `${m.ref_base ?? '売上'}の${m.ref_value}%`
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
  const [dealId, setDealId]               = useState<string | null>(null)
  const [showBooking, setShowBooking]     = useState(false)
  const [showSelfBook, setShowSelfBook]   = useState(false)
  const [bookedAt, setBookedAt]           = useState<string | null>(null)
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
        const res = await submitPartnerReferral(fd)
        if (res?.dealId) setDealId(res.dealId)
        setDone(true)
      } catch (err: any) { setError(err.message ?? '登録に失敗しました') }
    })
  }

  // 協力「自分で予約」: 予約確定の瞬間に協力deal を作成して dealId を返す（同意内包）
  async function coopCreateDeal(): Promise<string | null> {
    const fd = new FormData()
    fd.set('serviceId', selSvc!.id)
    fd.set('menuId', selMenu?.id ?? '')
    fd.set('customerName', customerName)
    fd.set('phone', phone)
    fd.set('memo', memo)
    fd.set('channel', 'cooperation')
    try { const res = await submitPartnerReferral(fd); return res?.dealId ?? null } catch { return null }
  }

  function resetForNext() {
    setDone(false); setStep('service'); setShowSelfBook(false)
    setSelSvc(null); setSelMenu(null); setCoopMode(false)
    setCustomerName(''); setPhone(''); setMemo(''); setConsent(false); setError('')
    setToken(null); setShowQR(false); setDealId(null); setShowBooking(false); setBookedAt(null)
  }

  const linkUrl    = token       ? `${location.origin}/r/${token}` : ''
  const bookingUrl = partnerCode ? `${location.origin}/book/${partnerCode}` : ''

  if (done) {
    const hl = rewardHighlight(selMenu, coopMode)
    return (
      <div className="page-anim" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, padding: '40px 28px', textAlign: 'center' }}>
        <div className="celebrate-pop" style={{ fontSize: '3rem', lineHeight: 1, marginBottom: 12 }} aria-hidden>🎉</div>
        <h2 style={{ fontSize: '1.18rem', fontWeight: 900, marginBottom: 8, letterSpacing: '-.01em' }}>
          {coopMode ? '協力を申し込みました！' : '紹介を登録しました！'}
        </h2>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 18 }}>
          MBが内容を確認し、次のステップへご案内します。
        </p>

        {/* 見込み報酬 */}
        {hl && (
          <div className="shine" style={{ background: 'linear-gradient(120deg,var(--blue) 0%,var(--blue-dk) 100%)', color: '#fff', borderRadius: 16, padding: '16px 22px', marginBottom: 22, minWidth: 220, boxShadow: '0 10px 28px rgba(71,51,230,.22)' }}>
            <div style={{ fontSize: '.6rem', opacity: .85, fontWeight: 700, letterSpacing: '.08em' }}>見込み報酬</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.7rem', marginTop: 4, lineHeight: 1.05 }}>{hl}</div>
            <div style={{ fontSize: '.58rem', opacity: .8, marginTop: 4 }}>成約時にお支払いします</div>
          </div>
        )}

        {bookedAt && (
          <p style={{ fontSize: '.7rem', color: 'var(--green)', fontWeight: 700, marginBottom: 12 }}>
            ✓ 商談 {new Date(bookedAt).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} を設定しました
          </p>
        )}

        {/* 次の一歩 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 }}>
          <button onClick={resetForNext} className="btn btn-p lift" style={{ width: '100%' }}>続けて紹介する</button>
          {dealId && !bookedAt && (
            <button onClick={() => setShowBooking(true)} className="btn btn-g lift" style={{ width: '100%' }}>商談を設定する（任意）</button>
          )}
          <button onClick={() => router.push('/app/cases')} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.74rem', fontWeight: 600, padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit' }}>
            案件一覧を見る →
          </button>
        </div>

        {showBooking && dealId && (
          <BookingDrawer dealId={dealId} onClose={() => setShowBooking(false)} onConfirmed={(at) => setBookedAt(at)} />
        )}
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
              まずはサービスを選んでください。次の画面で関わり方と報酬を選べます。
            </p>
          </div>
          <div className="stagger" style={{ padding: '0 20px' }}>
            {/* ② サービス選択: ロゴ＋名前＋一言コピーのみ（費用は出さない）。ブランドカラーのアクセント＋tap lift/shine */}
            {services.map(svc => {
              const copy = svc.subtitle || svc.description || ''
              return (
                <button key={svc.id} onClick={() => pickService(svc)} className="card-hover lift shine"
                  style={{ width: '100%', background: '#fff', border: '1px solid var(--line)', borderLeft: `3px solid ${svc.color}`, borderRadius: 16, padding: '15px 16px', marginBottom: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                    <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.95rem', fontWeight: 900, letterSpacing: '-.01em' }}>{svc.name}</div>
                      {copy && (
                        <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{copy}</div>
                      )}
                    </div>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg2)', color: 'var(--muted)', fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>›</span>
                  </div>
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
              <ServiceAvatar logoPath={selSvc.logo_path} icon={selSvc.icon} color={selSvc.color} name={selSvc.name} size={20} />
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
            <h2 style={{ fontSize: '.96rem', fontWeight: 900, marginTop: 6, letterSpacing: '-.01em' }}>
              {coopMode ? '協力を申し込む' : 'お客さまを紹介する'}
            </h2>
          </div>

          {/* 報酬ハイライト */}
          {rewardHighlight(selMenu, coopMode) && (
            <div className="shine" style={{ margin: '8px 20px 14px', background: 'linear-gradient(120deg,var(--blue) 0%,var(--blue-dk) 100%)', color: '#fff', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px rgba(71,51,230,.2)' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700 }}>{coopMode ? 'この協力の報酬' : 'この紹介で'}</div>
              <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.5rem', lineHeight: 1 }}>{rewardHighlight(selMenu, coopMode)}</div>
            </div>
          )}

          {/* この後の流れ 1-2-3 */}
          <div style={{ margin: '0 20px 14px', display: 'flex', gap: 8 }}>
            {[
              { n: '1', t: 'MBが対応', d: '内容を確認' },
              { n: '2', t: '商談・提案', d: 'お客さまへ' },
              { n: '3', t: '成約で報酬', d: '翌月末払い' },
            ].map(s => (
              <div key={s.n} style={{ flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 11, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--blue-bg)', color: 'var(--blue)', fontSize: '.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontFamily: 'Inter' }}>{s.n}</div>
                <div style={{ fontSize: '.64rem', fontWeight: 800 }}>{s.t}</div>
                <div style={{ fontSize: '.55rem', color: 'var(--muted2)', marginTop: 1 }}>{s.d}</div>
              </div>
            ))}
          </div>

          {/* ── 経路B（主役）: リンク/QR・予約リンクを送って本人に進めてもらう ── */}
          <div style={{ margin: '0 20px 12px', background: 'var(--blue-bg2)', border: '1.5px solid var(--blue-bg)', borderRadius: 14, padding: '15px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: '.56rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 6, padding: '2px 7px', letterSpacing: '.04em' }}>おすすめ</span>
              <b style={{ fontSize: '.82rem', color: 'var(--blue-dk)' }}>{coopMode ? '予約リンクを共有する' : 'リンク／QRを送る'}</b>
            </div>
            <p style={{ fontSize: '.64rem', color: '#52529E', margin: '0 0 12px', lineHeight: 1.6 }}>
              {coopMode
                ? 'あなたの予約ページを送れば、お客さまが希望日時を直接選べます。'
                : 'リンクやQRを送れば、お客さまご自身が登録できます（同意取得もスムーズ）。'}
            </p>
            {!coopMode && (token ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '11px 12px', marginBottom: 8 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.7rem', fontFamily: 'Inter', fontWeight: 600 }}>
                    {linkUrl.replace(/^https?:\/\//, '')}
                  </span>
                  <button onClick={copyLink} style={{ fontFamily: 'Inter', fontSize: '.55rem', letterSpacing: '.1em', background: copied ? 'var(--green)' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
                    {copied ? 'COPIED' : 'COPY'}
                  </button>
                </div>
                <button onClick={() => setShowQR(v => !v)} className="btn btn-p lift" style={{ width: '100%', marginTop: 0 }}>QRコードを表示</button>
                {showQR && <QRModal linkUrl={linkUrl} onClose={() => setShowQR(false)} />}
              </>
            ) : !coopMode ? (
              <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>リンクを生成中…</p>
            ) : null)}
            {coopMode && bookingUrl && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '11px 12px', marginBottom: 8 }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.7rem', fontFamily: 'Inter', fontWeight: 600 }}>
                    {bookingUrl.replace(/^https?:\/\//, '')}
                  </span>
                  <button onClick={copyBooking} style={{ fontFamily: 'Inter', fontSize: '.55rem', letterSpacing: '.1em', background: bookingCopied ? 'var(--green)' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
                    {bookingCopied ? 'COPIED' : 'COPY'}
                  </button>
                </div>
                {/* 同一画面2択: 自分で予約する → その場でカレンダー展開→枠選択→予約で協力deal＋商談予約を同時実行 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
                  <span style={{ flex: 1, height: 1, background: 'var(--blue-bg)' }} /><span style={{ fontSize: '.56rem', color: '#7676B0', fontWeight: 700 }}>または</span><span style={{ flex: 1, height: 1, background: 'var(--blue-bg)' }} />
                </div>
                <button type="button" onClick={() => { if (!customerName) { setError('自分で予約する前に、下の「お名前」を入力してください'); return } setError(''); setShowSelfBook(true) }}
                  className="btn btn-p lift" style={{ width: '100%' }}>自分で予約する</button>
                {error && <p style={{ fontSize: '.66rem', color: 'var(--red)', marginTop: 8 }}>{error}</p>}
              </>
            )}
          </div>

          {/* ── 経路A: その場でフォーム登録 ── */}
          <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '16px 18px 20px' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>その場で登録する</div>
            <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>必要なのはお名前だけ。連絡先・メモは任意です。</p>
            <form onSubmit={handleSubmit}>
              <div className="fld">
                <label>お名前 <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" required />
              </div>
              <div className="fld">
                <label>連絡先（任意）</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-XXXX-XXXX" />
              </div>
              <div className="fld">
                <label>メモ（任意）</label>
                <input value={memo} onChange={e => setMemo(e.target.value)} placeholder={coopMode ? '担当可能なエリア・スケジュール等' : '7月に引越し希望 など'} />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 15, height: 15 }}/>
                <label htmlFor="consent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}>
                  <b>{coopMode ? '自分でこの案件に協力します' : 'お客さまの同意を確認しました'}（必須）</b>
                </label>
              </div>
              {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
              <button type="submit" disabled={pending || !consent} className="btn btn-p lift" style={{ width: '100%' }}>
                {pending ? '送信中…' : (coopMode ? 'この案件に協力する' : 'この内容で紹介する')}
              </button>
            </form>
          </div>
          <div style={{ height: 24 }} />

          {/* 協力「自分で予約」: 予約確定で協力deal作成＋商談予約を同時実行 */}
          {showSelfBook && (
            <BookingDrawer
              createDeal={coopCreateDeal}
              onClose={() => setShowSelfBook(false)}
              onConfirmed={(at) => { setShowSelfBook(false); setBookedAt(at); setDone(true) }}
            />
          )}
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
          保存する
        </button>
        <div onClick={onClose} style={{ marginTop: 8, fontSize: '.7rem', color: 'var(--muted2)', cursor: 'pointer', fontWeight: 500 }}>閉じる</div>
      </div>
    </div>
  )
}
