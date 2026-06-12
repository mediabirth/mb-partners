'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'

type LinkInfo = {
  service: { id: string; name: string; subtitle: string | null; icon: string; color: string }
  menu: { name: string; ref_type: string; ref_value: number; example_ref: string | null } | null
}

export default function ReferralLandingPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const via   = searchParams.get('via') ?? 'link'

  const [info, setInfo]         = useState<LinkInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone]       = useState('')
  const [memo, setMemo]         = useState('')
  const [consent, setConsent]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
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
    if (!customerName) { setError('お名前を入力してください'); return }
    if (!consent) { setError('同意確認が必要です'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, customerName, phone, memo, via }),
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
      <div style={{ background: '#fff', borderRadius: 18, padding: '40px 32px', maxWidth: 360 }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
          <circle cx="12" cy="12" r="10" stroke="var(--blue)" strokeWidth="2"/>
          <path d="M7 12l3.5 3.5L17 8" stroke="var(--blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: 8 }}>送信しました</h2>
        <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>
          ご登録ありがとうございます。<br/>担当者よりご連絡いたします。
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#E9E9ED', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 20, boxShadow: '0 24px 70px rgba(14,14,20,.12)', padding: '32px 28px 36px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 24 }}>
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
            <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="3"/>
            <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="3"/>
            <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="3"/>
            <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
          </svg>
          <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.95rem' }}>
            MB <span style={{ color: 'var(--blue)' }}>Partners</span>
          </b>
        </div>

        {info && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px', background: 'var(--bg2)', borderRadius: 12 }}>
            <ServiceIcon icon={info.service.icon} color={info.service.color} size={42} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{info.service.name}</div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1 }}>{info.service.subtitle}</div>
            </div>
          </div>
        )}

        <h1 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 6, lineHeight: 1.4 }}>
          ご紹介の登録
        </h1>
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 22 }}>
          以下の情報を入力して送信してください。担当者よりご連絡いたします。
          {info?.menu?.example_ref && (
            <><br/><span style={{ color: 'var(--blue)', fontWeight: 600 }}>{info.menu.example_ref}</span></>
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="fld">
            <label>お名前 *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" required />
          </div>
          <div className="fld">
            <label>電話番号 / メールアドレス</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-XXXX-XXXX" />
          </div>
          <div className="fld">
            <label>ご相談内容・メモ(任意)</label>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="7月に引越し希望 など" />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--blue)', width: 15, height: 15 }} />
            <label htmlFor="consent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}>
              <b>Media Birth株式会社からのご連絡に同意します</b>。いただいた情報はサービスのご提案にのみ使用します。
            </label>
          </div>

          {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}

          <button type="submit" disabled={submitting || !consent}
            className="btn btn-p" style={{ width: '100%', marginTop: 4 }}>
            {submitting ? '送信中...' : '送信する'}
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
          </button>
        </form>

        <p style={{ fontSize: '.6rem', color: 'var(--muted)', textAlign: 'center', marginTop: 18, lineHeight: 1.7 }}>
          Media Birth株式会社 · パートナープログラム
        </p>
      </div>
    </div>
  )
}
