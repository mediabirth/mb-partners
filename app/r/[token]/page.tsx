'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'
import { trackFunnel } from '@/lib/funnel-client'

type LinkInfo = {
  service: { id: string; name: string; subtitle: string | null; icon: string; color: string }
  menu: { name: string; ref_type: string; ref_value: number; example_ref: string | null } | null
  referrerName?: string | null
}

export default function ReferralLandingPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const via   = searchParams.get('via') ?? 'link'

  const [info, setInfo]         = useState<LinkInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  // B2B 整合フォーム（会社名/担当者名/部署・役職/連絡先/メール/メモ）。token帰属は不変。
  const [companyName, setCompanyName]   = useState('')
  const [contactName, setContactName]   = useState('')
  const [contactTitle, setContactTitle] = useState('')
  const [phone, setPhone]       = useState('')
  const [email, setEmail]       = useState('')
  const [memo, setMemo]         = useState('')
  const [consent, setConsent]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    // ⑤ ランディング閲覧を計測（非ブロッキング・後追い・帰属/info取得には一切触れない）。
    trackFunnel('landing_view', { token })
    fetch(`/api/referral/info?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setNotFound(true); return }
        setInfo(d)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const person = contactName.trim()
    const company = companyName.trim()
    if (!person) { setError('ご担当者名（お名前）を入力してください'); return }
    // Batch B（クライアント送信gateの追加のみ・payload/サーバ insert は不変）：メールか電話のどちらか必須。
    if (!email.trim() && !phone.trim()) { setError('ご連絡のため、メールか電話のいずれかをご入力ください'); return }
    if (!consent) { setError('同意確認が必要です'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          // 会社名があれば一覧/コンソールの主体＝会社名（既存の表示規約に合わせる）。token帰属は API 側で不変。
          customerName: company || person,
          companyName: company,
          contactName: person,
          contactTitle: contactTitle.trim(),
          customerEmail: email.trim(),
          customerType: company ? 'corporate' : 'individual',
          phone, memo, via,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '送信に失敗しました'); return }
      setDone(true)
    } catch {
      setError('送信に失敗しました。時間をおいて再試行してください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E9E9ED' }}>
      <div style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中…</div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, background: '#E9E9ED', textAlign: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '40px 32px', maxWidth: 360 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 8 }}>リンクが見つかりません</h2>
        <p style={{ fontSize: '.76rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
          このリンクは無効または期限切れです。<br/>紹介者にご確認ください。
        </p>
      </div>
    </div>
  )

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, background: '#E9E9ED', textAlign: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '40px 32px', maxWidth: 380 }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
          <circle cx="12" cy="12" r="10" stroke="var(--c-blue)" strokeWidth="2"/>
          <path d="M7 12l3.5 3.5L17 8" stroke="var(--c-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 8 }}>受け付けました</h2>
        <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
          お問い合わせありがとうございます。<br/>担当者より追ってご連絡いたします。
        </p>
      </div>
    </div>
  )

  const referrer = (info?.referrerName ?? '').trim()
  const accent = info?.service.color || 'var(--c-blue)'

  return (
    <div style={{ minHeight: '100vh', background: '#E9E9ED', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, boxShadow: '0 24px 70px rgba(14,14,20,.12)', overflow: 'hidden' }}>

        {/* ── ブランドヘッダー（#4733E6） ── */}
        <div style={{ background: 'linear-gradient(135deg,#4733E6 0%,#3A28CE 100%)', color: '#fff', padding: '22px 28px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
              <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#fff" strokeWidth="3"/>
              <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#fff" strokeWidth="3"/>
              <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="rgba(255,255,255,.55)" strokeWidth="3"/>
              <rect x="28" y="28" width="14" height="14" rx="3"  fill="#fff"/>
            </svg>
            <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.95rem' }}>MB Partners</b>
          </div>
          {/* 紹介者名（表示のみ・帰属はサーバ側の token のまま不変） */}
          {referrer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, background: 'rgba(255,255,255,.14)', borderRadius: 12, padding: '9px 12px' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff', color: 'var(--c-blue)', fontWeight: 800, fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {referrer.charAt(0)}
              </span>
              <span style={{ fontSize: '.78rem', fontWeight: 700 }}>{referrer} 様からのご紹介です</span>
            </div>
          )}
          <h1 style={{ fontSize: '1.16rem', fontWeight: 900, marginTop: referrer ? 14 : 18, lineHeight: 1.5, letterSpacing: '-.01em' }}>
            {info?.service.name ? `${info.service.name}のご相談を承ります` : 'ご相談を承ります'}
          </h1>
          <p style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.88)', lineHeight: 1.8, marginTop: 8 }}>
            MB Partners が貴社の課題に合わせて最適な専門サービスをご提案し、商談から成約まで一貫してサポートいたします。
          </p>
        </div>

        <div style={{ padding: '22px 28px 32px' }}>
          {/* サービスカード */}
          {info && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: '12px', background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--line)' }}>
              <ServiceIcon icon={info.service.icon} color={info.service.color} size={42} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{info.service.name}</div>
                {info.service.subtitle && <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1 }}>{info.service.subtitle}</div>}
              </div>
            </div>
          )}

          {/* 安心の3ステップ（被紹介先向け） */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[
              { n: '1', t: 'MBが対応', d: '内容を確認' },
              { n: '2', t: '商談・ご提案', d: '貴社に最適化' },
              { n: '3', t: '成約・着手', d: '一貫サポート' },
            ].map(s => (
              <div key={s.n} style={{ flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 11, padding: '11px 6px', textAlign: 'center' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--blue-bg)', color: 'var(--c-blue)', fontSize: '.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontFamily: 'Inter' }}>{s.n}</div>
                <div style={{ fontSize: '.63rem', fontWeight: 800 }}>{s.t}</div>
                <div style={{ fontSize: '.54rem', color: 'var(--muted2)', marginTop: 1 }}>{s.d}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '.78rem', fontWeight: 800, marginBottom: 4 }}>お問い合わせ内容</div>
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 16 }}>
            下記をご入力のうえ送信してください。担当者より追ってご連絡いたします。
          </p>

          <form onSubmit={handleSubmit}>
            <div className="fld">
              <label>会社名（任意）</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" style={{ minHeight: 44 }} />
            </div>
            <div className="fld">
              <label>ご担当者名 <span style={{ color: 'var(--red)' }}>*</span></label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" required style={{ minHeight: 44 }} />
            </div>
            <div className="fld">
              <label>部署・役職（任意）</label>
              <input value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="例：営業部 部長" style={{ minHeight: 44 }} />
            </div>
            <p style={{ fontSize: '.6rem', color: 'var(--blue-dk)', fontWeight: 600, margin: '0 2px 6px' }}>※ メールか電話のいずれかは必須です</p>
            <div className="fld">
              <label>電話番号</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" style={{ minHeight: 44 }} />
            </div>
            <div className="fld">
              <label>メールアドレス</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" autoComplete="off" style={{ minHeight: 44 }} />
            </div>
            <div className="fld">
              <label>ご相談内容・メモ（任意）</label>
              <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="例：来期の集客強化を検討中 など" style={{ minHeight: 44 }} />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--c-blue)', width: 15, height: 15 }} />
              <label htmlFor="consent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}>
                <b>Media Birth株式会社からのご連絡に同意します</b>。いただいた情報はサービスのご提案にのみ使用します。
              </label>
            </div>

            {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}

            <button type="submit" disabled={submitting || !consent}
              className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', minHeight: 48, fontSize: '.9rem', fontWeight: 800, background: 'linear-gradient(135deg, var(--c-blue), var(--blue-dk))', boxShadow: '0 8px 20px rgba(71,51,230,.28)' }}>
              {submitting ? '送信中…' : '無料で相談する'}
            </button>
            <p style={{ fontSize: '.6rem', color: 'var(--muted)', textAlign: 'center', marginTop: 12, lineHeight: 1.7 }}>
              送信いただいても費用は発生しません。内容を確認のうえ担当者よりご連絡します。
            </p>
          </form>

          <p style={{ fontSize: '.6rem', color: 'var(--muted)', textAlign: 'center', marginTop: 16, lineHeight: 1.7, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            Media Birth株式会社 · パートナープログラム
          </p>
        </div>
      </div>
    </div>
  )
}
