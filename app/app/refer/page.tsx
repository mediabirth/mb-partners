'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import ServiceAvatar from '@/components/ServiceAvatar'
import BookingDrawer from '@/components/BookingDrawer'
import PushOptIn from '@/components/PushOptIn'
import { trackFunnel } from '@/lib/funnel-client'
import CountUp from '@/components/CountUp'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'
import { getOrCreateReferralToken, submitPartnerReferral, getPartnerInfo } from './actions'

type Step = 'service' | 'menu' | 'form' | 'consult'

// ── 紹介リンクのB2B共有 文面テンプレ（1箇所に集約・後で編集可能）──────────────
// 事業者向けの丁寧な日本語ビジネス紹介文。{url} に表示中の partner 固有リンク(/r/…)が入る。
// リンクの生成・保存は無改修（既存 linkUrl をそのまま共有するだけ）。
const SHARE_TEMPLATE = {
  mailSubject: 'ご事業に役立つ専門サービスのご紹介',
  mailBody: (url: string) => [
    'お世話になっております。',
    '',
    '貴社のご事業に役立つ可能性のある専門サービスをご紹介いたします。',
    'MB Partners が課題に合わせて最適な専門家・サービスをご提案し、商談から成約まで一貫してサポートいたします。',
    '',
    '下記より詳細をご確認のうえ、お気軽にお問い合わせください。',
    url,
    '',
    '何卒よろしくお願い申し上げます。',
  ].join('\n'),
  lineText: (url: string) => [
    '貴社のご事業に役立つ専門サービスのご紹介です。',
    'MB Partners が最適な専門家をご提案し、成約までサポートいたします。',
    url,
  ].join('\n'),
}

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
  // 4: services は不変マスタ。SWRでキャッシュ（CDNキャッシュ済＋クライアントでも再取得抑制）
  const { data: services = [] } = useSWR<ServiceWithMenus[]>('/api/services')
  const [step, setStep]                   = useState<Step>('service')
  const [selSvc, setSelSvc]               = useState<ServiceWithMenus | null>(null)
  const [selMenu, setSelMenu]             = useState<MenuRow | null>(null)
  const [coopMode, setCoopMode]           = useState(false)
  const [customerType, setCustomerType]   = useState<'individual' | 'corporate'>('individual')
  const [customerName, setCustomerName]   = useState('')
  const [companyName, setCompanyName]     = useState('')
  const [contactName, setContactName]     = useState('')
  const [contactTitle, setContactTitle]   = useState('') // ②a 法人: 部署・役職（任意・additive）
  const [phone, setPhone]                 = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [memo, setMemo]                   = useState('')
  const [consent, setConsent]             = useState(false)
  // L3: 相談（サービス未定）起票用
  const [consultNote, setConsultNote]     = useState('')
  const [consultCoop, setConsultCoop]     = useState(false)
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
    trackFunnel('share', { channel: 'copy', token }) // ⑤ 計測(非ブロッキング・後追い)
    navigator.clipboard?.writeText(`${location.origin}/r/${token}`).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  function copyBooking() {
    navigator.clipboard?.writeText(`${location.origin}/book/${partnerCode}`).then(() => {
      setBookingCopied(true); setTimeout(() => setBookingCopied(false), 2000)
    })
  }

  // B2B共有導線：表示中の紹介リンク(linkUrl=/r/…)を共有インテントで送る（生成・保存は無改修）。
  function shareEmail() {
    if (!linkUrl) return
    trackFunnel('share', { channel: 'mail', token }) // ⑤ 計測(非ブロッキング・後追い)
    const href = `mailto:?subject=${encodeURIComponent(SHARE_TEMPLATE.mailSubject)}&body=${encodeURIComponent(SHARE_TEMPLATE.mailBody(linkUrl))}`
    window.location.href = href
  }
  function shareLine() {
    if (!linkUrl) return
    trackFunnel('share', { channel: 'line', token }) // ⑤ 計測(非ブロッキング・後追い)
    const href = `https://line.me/R/share?text=${encodeURIComponent(SHARE_TEMPLATE.lineText(linkUrl))}`
    window.open(href, '_blank', 'noopener')
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
      fd.set('contactTitle', contactTitle) // ②a 部署・役職（法人時のみ・任意）
      fd.set('customerName', companyName) // 一覧等の後方互換: 表示主体=会社名
    } else {
      fd.set('customerName', customerName)
    }
    fd.set('customerEmail', customerEmail.trim()) // 任意：確認/リマインドの顧客送付に使用
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

  // L3: 相談（サービス未定）の起票
  function handleConsultSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const ce = customerError(); if (ce) { setError(ce); return }
    if (!consent) { setError('顧客の同意確認が必要です'); return }
    const fd = new FormData()
    fd.set('serviceId', '')
    fd.set('menuId', '')
    applyCustomerFields(fd)
    fd.set('phone', phone)
    fd.set('memo', consultNote)
    fd.set('channel', consultCoop ? 'cooperation' : 'referral')
    fd.set('isConsultation', '1')
    startTransition(async () => {
      try {
        const res = await submitPartnerReferral(fd)
        if (res?.dealId) setDealId(res.dealId)
        setDone(true)
      } catch (err: any) { setError(err.message ?? '起票に失敗しました') }
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
    setCustomerType('individual'); setCustomerName(''); setCompanyName(''); setContactName(''); setContactTitle('')
    setPhone(''); setCustomerEmail(''); setMemo(''); setConsent(false); setError('')
    setConsultNote(''); setConsultCoop(false)
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

        {/* ④a: 初回紹介の完了直後にソフト前置きで通知許可を取得（受け取る時のみネイティブ許可） */}
        <div style={{ width: '100%', maxWidth: 320, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
          <PushOptIn />
        </div>

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
          <BookingDrawer dealId={dealId} defaultCustomerEmail={customerEmail} onClose={() => setShowBooking(false)} onConfirmed={(at) => setBookedAt(at)} />
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

            {/* L3: サービス未定で相談として起票 */}
            <button onClick={() => setStep('consult')} className="lift"
              style={{ width: '100%', background: 'var(--bg2)', border: '1.5px dashed var(--line)', borderRadius: 16, padding: '14px 16px', marginBottom: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--muted2)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.86rem', fontWeight: 800 }}>サービスが決まっていない</div>
                <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2, lineHeight: 1.5 }}>まず「相談」として起票。面談でサービスを決めます。</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '.95rem', flexShrink: 0 }}>›</span>
            </button>
          </div>
        </div>
      )}

      {/* ── L3: 相談（サービス未定）の起票フォーム ───────────────────── */}
      {step === 'consult' && (
        <div className="page-anim">
          <button onClick={() => setStep('service')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>← サービス選択</button>
          <div style={{ padding: '10px 20px 6px' }}>
            <div className="eyebrow">相談として起票</div>
            <h2 style={{ fontSize: '.96rem', fontWeight: 900, marginTop: 6, letterSpacing: '-.01em' }}>サービス未定のお客さまを起票</h2>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>関わり方だけ選び、内容は面談で詰めます。サービス・金額は後から運営が確定します。</p>
          </div>
          <form onSubmit={handleConsultSubmit} style={{ padding: '4px 20px 24px' }}>
            <div className="fld">
              <label>関わり方</label>
              <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4 }}>
                {[['ref', '紹介'], ['coop', '協力']].map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setConsultCoop(v === 'coop')} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, padding: '9px 2px', borderRadius: 8, color: (v === 'coop') === consultCoop ? 'var(--txt)' : 'var(--muted2)', background: (v === 'coop') === consultCoop ? '#fff' : 'transparent', boxShadow: (v === 'coop') === consultCoop ? '0 2px 8px rgba(14,14,20,.08)' : 'none' }}>{l}</button>
                ))}
              </div>
            </div>
            <div className="fld">
              <label>お客様区分</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['individual', '個人'], ['corporate', '法人']].map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setCustomerType(v as 'individual' | 'corporate')} style={{ flex: 1, border: `1.5px solid ${customerType === v ? 'var(--blue)' : 'var(--line)'}`, borderRadius: 9, padding: '9px 2px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 700, background: customerType === v ? 'var(--blue)' : '#fff', color: customerType === v ? '#fff' : 'var(--txt)' }}>{l}</button>
                ))}
              </div>
            </div>
            {customerType === 'individual' ? (
              <div className="fld"><label>お客様のお名前 <span style={{ color: 'var(--red)' }}>*</span></label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" /></div>
            ) : (
              <>
                <div className="fld"><label>会社名 <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" /></div>
                <div className="fld"><label>ご担当者名（任意）</label>
                  <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" /></div>
                <div className="fld"><label>部署・役職（任意）</label>
                  <input value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="例：営業部 部長" /></div>
              </>
            )}
            <div className="fld"><label>相談内容（何を迷っているか）</label>
              <textarea value={consultNote} onChange={e => setConsultNote(e.target.value)} rows={3} placeholder="例：集客と採用、どちらから着手すべきか迷っている 等" style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.85rem', resize: 'vertical' }} /></div>
            <div className="fld"><label>連絡先（任意）</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-XXXX-XXXX" /></div>
            <div className="fld"><label>顧客メールアドレス（任意）</label>
              <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" autoComplete="off" /></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, margin: '4px 0 12px' }}>
              <input type="checkbox" id="consultConsent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 15, height: 15 }} />
              <label htmlFor="consultConsent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}><b>お客さまの同意を確認しました（必須）</b></label>
            </div>
            {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
            <button type="submit" disabled={pending || !consent} className="btn btn-p lift" style={{ width: '100%' }}>
              {pending ? '送信中…' : '相談として起票する'}
            </button>
          </form>
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
                {/* B2B共有導線：メール(主導線・先頭/目立つ)＋LINE。共有対象は表示中の紹介リンク linkUrl(/r/…)。QRは現状維持。 */}
                <button onClick={shareEmail} className="btn btn-p lift" style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
                  メールで送る
                </button>
                <button onClick={shareLine} className="lift" style={{ width: '100%', minHeight: 44, background: '#06C755', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.07.7.2.8.5.07.27.05.7.02.97l-.13.8c-.04.24-.2.94.82.51 1.02-.43 5.5-3.24 7.5-5.55C20.6 14.9 22 13.1 22 11c0-4.4-4.5-8-10-8z"/></svg>
                  LINEで送る
                </button>
                <button onClick={() => { if (!showQR) trackFunnel('share', { channel: 'qr', token }); setShowQR(v => !v) }} className="btn btn-p lift" style={{ width: '100%', marginTop: 0 }}>QRコードを表示</button>
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
                  <div className="fld">
                    <label>部署・役職（任意）</label>
                    <input value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="例：営業部 部長" />
                  </div>
                </>
              )}
              <div className="fld">
                <label>連絡先（任意）</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-XXXX-XXXX" />
              </div>
              <div className="fld">
                <label>顧客メールアドレス（任意）</label>
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" autoComplete="off" />
                <p style={{ fontSize: '.58rem', color: 'var(--muted2)', margin: '4px 2px 0', lineHeight: 1.5 }}>ご入力いただくと、商談予約の確認・リマインドをお客様にもお送りします。</p>
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

          {/* ── AI紹介文ドラフト（補助・併設）。既存の共有導線/SHARE_TEMPLATEは無改修。 ── */}
          <div style={{ margin: '12px 20px 0' }}>
            <AiIntroPanel
              defaultContact={customerType === 'corporate' ? companyName : customerName}
              defaultService={selSvc.name}
              defaultNeed={memo}
            />
          </div>

          <div style={{ height: 24 }} />

          {/* 協力「自分で予約」: 予約確定で協力deal作成＋商談予約を同時実行 */}
          {showSelfBook && (
            <BookingDrawer
              createDeal={coopCreateDeal}
              defaultCustomerEmail={customerEmail}
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
        <span className={`chip ${chipCls}`}>{label}</span>
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

// AI紹介文ドラフト：紹介先へ送る文面の“下書き”を生成する補助パネル。
// ★紹介の作成・帰属・お金には一切関与しない。既存の共有導線(COPY/QR/メール/LINE)とは独立。
// APIキー未設定(disabled)なら何も表示しない。生成結果は編集可能・コピーのみ。
function AiIntroPanel({ defaultContact, defaultService, defaultNeed }: {
  defaultContact: string; defaultService: string; defaultNeed: string
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null) // null=判定中
  const [open, setOpen]       = useState(false)
  const [contact, setContact] = useState(defaultContact)
  const [need, setNeed]       = useState(defaultNeed)
  const [service, setService] = useState(defaultService)
  const [tone, setTone]       = useState('丁寧')
  const [draft, setDraft]     = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')
  const [copied, setCopied]   = useState(false)

  // 機能の有効判定（APIキー設定有無）。未設定 or 未認証ならパネル非表示。
  useEffect(() => {
    let alive = true
    fetch('/api/ai/draft-intro')
      .then(r => r.ok ? r.json() : { enabled: false })
      .then(j => { if (alive) setEnabled(!!j.enabled) })
      .catch(() => { if (alive) setEnabled(false) })
    return () => { alive = false }
  }, [])

  async function generate() {
    setErr(''); setBusy(true); setCopied(false)
    try {
      const res = await fetch('/api/ai/draft-intro', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact, need, service, tone }),
      })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setEnabled(false); return }
      if (!res.ok) { setErr(j?.error || '生成に失敗しました。時間をおいて再度お試しください。'); return }
      setDraft(j.draft || '')
    } catch {
      setErr('通信に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setBusy(false)
    }
  }

  function copyDraft() {
    if (!draft) return
    navigator.clipboard?.writeText(draft).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!enabled) return null // 判定中(null)・無効(false)は非表示

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="lift"
        style={{ width: '100%', background: '#fff', border: '1px dashed var(--line)', borderRadius: 13, padding: '13px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--blue)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 4.8L12 14.6 8 16.8l1-4.8L5.5 9l4.6-1.4L12 3z"/></svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 800 }}>AIで紹介文を作る</span>
          <span style={{ display: 'block', fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, lineHeight: 1.5 }}>相手とニーズを入れると、送る文面の下書きを作成します。</span>
        </span>
        <span style={{ color: 'var(--muted)', fontSize: '.9rem', flexShrink: 0 }}>›</span>
      </button>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '16px 18px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: 'var(--blue)', display: 'flex' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 4.8L12 14.6 8 16.8l1-4.8L5.5 9l4.6-1.4L12 3z"/></svg>
        </span>
        <b style={{ fontSize: '.8rem', fontWeight: 800 }}>AIで紹介文を作る</b>
        <button type="button" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.66rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>下書きの“たたき台”です。送る前に必ず内容をご確認・編集ください。</p>

      <div className="fld">
        <label>紹介先の相手（企業・担当者）</label>
        <input value={contact} onChange={e => setContact(e.target.value)} placeholder="例：株式会社〇〇 山田様" />
      </div>
      <div className="fld">
        <label>相手の課題・ニーズ</label>
        <textarea value={need} onChange={e => setNeed(e.target.value)} rows={2} placeholder="例：採用がうまくいかず、母集団形成に課題がある"
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.85rem', resize: 'vertical' }} />
      </div>
      <div className="fld">
        <label>紹介したいサービス（任意）</label>
        <input value={service} onChange={e => setService(e.target.value)} placeholder="例：採用支援サービス" />
      </div>
      <div className="fld">
        <label>トーン（任意）</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['丁寧', 'カジュアル', 'フォーマル'].map(t => (
            <button type="button" key={t} onClick={() => setTone(t)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${tone === t ? 'var(--blue)' : 'var(--line)'}`,
                background: tone === t ? 'var(--blue)' : '#fff', color: tone === t ? '#fff' : 'var(--txt)' }}>{t}</button>
          ))}
        </div>
      </div>

      <button type="button" onClick={generate} disabled={busy} className="btn btn-p lift" style={{ width: '100%', marginTop: 2 }}>
        {busy ? '生成中…' : (draft ? '作り直す' : '生成する')}
      </button>
      {err && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '10px 0 0', lineHeight: 1.6 }}>{err}</p>}

      {draft && (
        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 6 }}>生成結果（編集できます）</label>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={8}
            style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontFamily: 'inherit', fontSize: '.82rem', lineHeight: 1.7, resize: 'vertical' }} />
          <button type="button" onClick={copyDraft} className="lift"
            style={{ width: '100%', marginTop: 8, minHeight: 44, background: copied ? 'var(--green)' : 'var(--bg2)', color: copied ? '#fff' : 'var(--txt)', border: '1px solid var(--line)', borderRadius: 9, fontFamily: 'inherit', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer' }}>
            {copied ? 'コピーしました' : 'コピーする'}
          </button>
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
