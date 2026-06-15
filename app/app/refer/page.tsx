'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ServiceAvatar from '@/components/ServiceAvatar'
import BookingDrawer from '@/components/BookingDrawer'
import CountUp from '@/components/CountUp'
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
  const [customerType, setCustomerType]   = useState<'individual' | 'corporate'>('individual')
  const [customerName, setCustomerName]   = useState('')
  const [companyName, setCompanyName]     = useState('')
  const [contactName, setContactName]     = useState('')
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

  // ⑦ 顧客属性のバリデーション＋FormData組み立て（customer_name は表示用に会社名/氏名を入れる）
  function customerError(): string {
    if (customerType === 'corporate') {
      if (!companyName) return '会社名を入力してください'
    } else if (!customerName) {
      return 'お客様のお名前を入力してください'
    }
    return ''
  }
  function applyCustomerFields(fd: FormData) {
    fd.set('customerType', customerType)
    if (customerType === 'corporate') {
      fd.set('companyName', companyName)
      fd.set('contactName', contactName)
      fd.set('customerName', companyName) // 一覧等の後方互換: 表示主体=会社名
    } else {
      fd.set('customerName', customerName)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const ce = customerError(); if (ce) { setError(ce); return }
    if (!consent) { setError('顧客の同意確認が必要です'); return }
    const fd = new FormData()
    fd.set('serviceId', selSvc!.id)
    fd.set('menuId', selMenu?.id ?? '')
    applyCustomerFields(fd)
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
    const ce = customerError(); if (ce) { setError(ce); return null }
    const fd = new FormData()
    fd.set('serviceId', selSvc!.id)
    fd.set('menuId', selMenu?.id ?? '')
    applyCustomerFields(fd)
    fd.set('phone', phone)
    fd.set('memo', memo)
    fd.set('channel', 'cooperation')
    try { const res = await submitPartnerReferral(fd); return res?.dealId ?? null } catch { return null }
  }

  function resetForNext() {
    setDone(false); setStep('service'); setShowSelfBook(false)
    setSelSvc(null); setSelMenu(null); setCoopMode(false)
    setCustomerType('individual'); setCustomerName(''); setCompanyName(''); setContactName('')
    setPhone(''); setMemo(''); setConsent(false); setError('')
    setToken(null); setShowQR(false); setDealId(null); setShowBooking(false); setBookedAt(null)
  }

  const linkUrl    = token       ? `${location.origin}/r/${token}` : ''
  const bookingUrl = partnerCode ? `${location.origin}/book/${partnerCode}` : ''

  if (done) {
    const hl = rewardHighlight(selMenu, coopMode)
    return (
      <div className="page-anim" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 380, padding: '40px 28px', textAlign: 'center' }}>
        {/* ⑥ 煽りでなく感謝。控えめなチェック */}
        <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2.2"><path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h2 style={{ fontSize: '1.12rem', fontWeight: 800, marginBottom: 8, letterSpacing: '-.01em' }}>
          {coopMode ? 'お預かりしました' : 'ご紹介ありがとうございます'}
        </h2>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 18 }}>
          MBが内容を確認し、次のステップへご案内します。
          {hl && <><br/><span style={{ color: 'var(--muted)' }}>報酬の目安：{hl}（成約時）</span></>}
        </p>

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
                <button key={svc.id} onClick={() => pickService(svc)} className="card-hover lift"
                  style={{ width: '100%', background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '15px 16px', marginBottom: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', overflow: 'hidden', position: 'relative' }}>
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
              メニューごとに「紹介」か「協力」を選べます。あなたに合うかたちで。
            </p>
          </div>
          {/* B2: メニュー単位グルーピング。各メニュー見出しの下に 紹介/協力 の選択肢 */}
          <div className="stagger" style={{ padding: '0 20px 24px' }}>
            {selSvc.service_menus.filter(m => m.ref_enabled !== false || m.coop_enabled === true).map(m => (
              <div key={m.id} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 2px 10px' }}>
                  <span style={{ width: 4, height: 16, borderRadius: 2, background: selSvc.color }} />
                  <b style={{ fontSize: '.86rem', fontWeight: 900, letterSpacing: '-.01em' }}>{m.name}</b>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {m.ref_enabled !== false && <EngageOption menu={m} kind="ref" accent={selSvc.color} onPick={() => pickMenu(m)} />}
                  {m.coop_enabled === true && <EngageOption menu={m} kind="coop" accent={selSvc.color} onPick={() => pickCoop(m)} />}
                </div>
              </div>
            ))}
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

          {/* ⑥ 報酬は控えめに添える */}
          {rewardHighlight(selMenu, coopMode) && (
            <div style={{ margin: '6px 20px 14px', display: 'flex', alignItems: 'baseline', gap: 8, color: 'var(--muted)' }}>
              <span style={{ fontSize: '.66rem' }}>{coopMode ? '協力報酬の目安' : '紹介報酬の目安'}</span>
              <span style={{ fontFamily: 'Inter', fontSize: '.84rem', fontWeight: 700, color: 'var(--txt)' }}>{rewardHighlight(selMenu, coopMode)}</span>
              <span style={{ fontSize: '.6rem' }}>（成約時）</span>
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
                <button type="button" onClick={() => { const ce = customerError(); if (ce) { setError('自分で予約する前に、下の「お客様情報」を入力してください'); return } setError(''); setShowSelfBook(true) }}
                  className="btn btn-p lift" style={{ width: '100%' }}>自分で予約する</button>
                {error && <p style={{ fontSize: '.66rem', color: 'var(--red)', marginTop: 8 }}>{error}</p>}
              </>
            )}
          </div>

          {/* ── 経路A: その場でフォーム登録 ── */}
          <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '16px 18px 20px' }}>
            <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--txt)', marginBottom: 4 }}>その場で登録する</div>
            <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>連絡先・メモは任意です。</p>
            <form onSubmit={handleSubmit}>
              {/* ⑦ お客様の属性 */}
              <div className="fld">
                <label>お客様の種別</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['individual', '個人'], ['corporate', '法人']] as const).map(([v, l]) => (
                    <button type="button" key={v} onClick={() => setCustomerType(v)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${customerType === v ? 'var(--blue)' : 'var(--line)'}`,
                        background: customerType === v ? 'var(--blue)' : '#fff', color: customerType === v ? '#fff' : 'var(--txt)' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {customerType === 'individual' ? (
                <div className="fld">
                  <label>{coopMode ? 'お客様のお名前' : 'ご紹介先のお名前'} <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" />
                </div>
              ) : (
                <>
                  <div className="fld">
                    <label>会社名 <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" />
                  </div>
                  <div className="fld">
                    <label>ご担当者名（任意）</label>
                    <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" />
                  </div>
                </>
              )}
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

// ⑤⑥: 関わり方の選択肢（紹介/協力）。枠の色を排しリスト然と。対応範囲はオシャレなタグ。報酬は控えめに添える。
function EngageOption({ menu, kind, accent: _accent, onPick }: {
  menu: MenuRow; kind: 'ref' | 'coop'; accent: string; onPick: () => void
}) {
  const isRef = kind === 'ref'
  const fixed = isRef ? menu.ref_type === 'fixed' : menu.coop_type === 'fixed'
  const val   = isRef ? Number(menu.ref_value) : Number(menu.coop_value ?? 0)
  const base  = isRef ? menu.ref_base : menu.coop_base
  const cov   = ((isRef ? menu.coverage_steps : menu.coop_coverage) ?? []).filter((s: { included: boolean }) => s.included)
  const cond  = isRef ? menu.qualification : menu.coop_condition
  const label = isRef ? '紹介' : '協力'
  const chipCls = isRef ? 'chip-referral' : 'chip-cooperation'
  const reward = fixed ? `¥${val.toLocaleString()}` : `${val}%${base ? `・${base}` : ''}`

  return (
    <button onClick={onPick} className="card-hover lift"
      style={{ width: '100%', background: '#fff', textAlign: 'left', fontFamily: 'inherit', border: '1px solid var(--line)', borderRadius: 12, padding: '13px 15px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* 関わり方アイコン（紹介=方向／協力=並ぶ）仮当て。currentColorでchip色に追従 */}
        <span className={`chip ${chipCls}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={isRef ? '/icons/referral-glyph.svg' : '/icons/cooperation-glyph.svg'} alt="" width={14} height={14} style={{ display: 'block' }} />
          {label}
        </span>
        {/* 報酬は控えめに添える */}
        <span style={{ marginLeft: 'auto', fontFamily: 'Inter', fontSize: '.82rem', fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{reward}</span>
        <span style={{ color: 'var(--muted)', fontSize: '.85rem', flexShrink: 0 }}>›</span>
      </div>
      {cov.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
          {cov.map((s: { label: string }) => (
            <span key={s.label} style={{ fontSize: '.57rem', fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: 'var(--bg2)', color: 'var(--muted)', border: '1px solid var(--line)' }}>{s.label}</span>
          ))}
        </div>
      )}
      {cond && <p style={{ fontSize: '.61rem', color: 'var(--muted2)', margin: '7px 0 0', lineHeight: 1.5 }}>※ {cond}</p>}
    </button>
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
