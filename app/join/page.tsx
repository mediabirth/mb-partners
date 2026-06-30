'use client'
/**
 * 外向けLP B1：プロ紹介者(士業・コンサル)募集ページ /join（公開・未認証で閲覧可）。
 * 応募は /api/partner-apply に保存するだけ（アカウント作成・auth・お金には一切関与しない）。
 * ★報酬の金額・率はLP上に一切表示しない（面談で個別案内）。既存ブランドトークン流用・新hexなし。
 */
import { useState, useEffect } from 'react'

const SERVICES = [
  { name: 'PRAGMATION', desc: 'DX・AI導入' },
  { name: 'RESONATION', desc: 'ブランディング' },
  { name: 'MOOM', desc: '不動産テック' },
  { name: 'MatchHub', desc: '採用・HR' },
]

export default function JoinPage() {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [expertise, setExpertise] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  // Feature E（E-2）：招待リンク /join?ref=<partner_id> の紹介元を捕捉（非金銭・保存はサーバで実在検証）。
  const [ref, setRef] = useState<string | null>(null)
  useEffect(() => { try { setRef(new URLSearchParams(window.location.search).get('ref')) } catch { /* noop */ } }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('お名前をご入力ください'); return }
    if (!email.trim() && !phone.trim()) { setError('ご連絡のため、メールか電話のいずれかをご入力ください'); return }
    if (!consent) { setError('ご連絡への同意確認が必要です'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/partner-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, org, expertise, email, phone, message, consent, ref }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? '送信に失敗しました'); return }
      setDone(true)
    } catch {
      setError('送信に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 20px' }
  const sectionTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em', marginBottom: 14 }

  return (
    <div style={{ minHeight: '100vh', background: '#E9E9ED' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', background: '#fff', minHeight: '100vh', boxShadow: '0 0 48px rgba(14,14,20,.1)' }}>

        {/* ── Hero ── */}
        <div style={{ background: 'linear-gradient(135deg,#4733E6 0%,#3A28CE 100%)', color: '#fff', padding: '30px 26px 34px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
            <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
              <rect x="6" y="6" width="14" height="14" rx="3" stroke="#fff" strokeWidth="3" />
              <rect x="28" y="6" width="14" height="14" rx="7" stroke="#fff" strokeWidth="3" />
              <rect x="6" y="28" width="14" height="14" rx="7" stroke="rgba(255,255,255,.55)" strokeWidth="3" />
              <rect x="28" y="28" width="14" height="14" rx="3" fill="#fff" />
            </svg>
            <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.95rem' }}>MB Partners</b>
          </div>
          <div style={{ fontSize: '.6rem', fontWeight: 700, letterSpacing: '.14em', opacity: .85, marginBottom: 10 }}>MB PARTNERS 紹介パートナー制度</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.4, letterSpacing: '-.01em' }}>顧問先・人脈を、<br />“紹介するだけ”で成果に。</h1>
          <p style={{ fontSize: '.74rem', color: 'rgba(255,255,255,.9)', lineHeight: 1.9, marginTop: 14 }}>
            士業・コンサルの先生方が日々受ける“専門外のご相談”を、Media Birthが商談から成約・納品まで一貫してお引き受けします。先生は紹介するだけ。顧客との信頼関係はそのままに、新しい価値と報酬を。
          </p>
          <a href="#apply" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 50, marginTop: 22, background: '#fff', color: 'var(--blue-dk)', borderRadius: 12, fontWeight: 800, fontSize: '.92rem', textDecoration: 'none', boxShadow: '0 8px 22px rgba(0,0,0,.18)' }}>パートナーに応募する</a>
          <a href="#how" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: '.7rem', color: 'rgba(255,255,255,.9)', textDecoration: 'none', fontWeight: 600 }}>制度の詳細を見る ↓</a>
        </div>

        <div style={{ padding: '26px 22px 40px' }}>

          {/* ── こんな先生方へ ── */}
          <section style={{ marginBottom: 26 }}>
            <h2 style={sectionTitle}>こんな先生方へ</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                '顧客からDX/AI・採用・資金など専門外の相談を受けるが、受け皿がない',
                '信頼できる紹介先がなく、“わからない”で終わってしまう',
                '顧客との関係を活かして、新しい収益の柱をつくりたい',
              ].map((t, i) => (
                <div key={i} style={{ ...card, display: 'flex', gap: 11, alignItems: 'flex-start', padding: '14px 16px' }}>
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--blue-bg)', color: 'var(--c-blue)', fontSize: '.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter' }}>✓</span>
                  <span style={{ fontSize: '.76rem', lineHeight: 1.7, color: 'var(--txt)' }}>{t}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 仕組み 3ステップ ── */}
          <section id="how" style={{ marginBottom: 26 }}>
            <h2 style={sectionTitle}>仕組み（3ステップ）</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { n: '1', t: '紹介する', d: '顧客の課題をMBにつなぐだけ。' },
                { n: '2', t: 'MBが対応', d: '商談・提案・成約・納品まで一貫してMBが実行します。' },
                { n: '3', t: '成果に応じた報酬', d: '成約に応じてパートナー報酬。※具体条件は面談で個別にご案内します。' },
              ].map(s => (
                <div key={s.n} style={{ ...card, display: 'flex', gap: 13, alignItems: 'flex-start', padding: '15px 16px' }}>
                  <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg, var(--c-blue), var(--blue-dk))', color: '#fff', fontSize: '.84rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter' }}>{s.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.84rem', fontWeight: 800 }}>{s.t}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted2)', marginTop: 3, lineHeight: 1.7 }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── 提供サービス例 ── */}
          <section style={{ marginBottom: 26 }}>
            <h2 style={sectionTitle}>提供サービス例</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {SERVICES.map(s => (
                <div key={s.name} style={{ ...card, padding: '14px 14px' }}>
                  <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.82rem', color: 'var(--blue-dk)' }}>{s.name}</div>
                  <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>{s.desc}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7 }}>…など幅広い専門領域を、MBが責任を持って実行します。</p>
          </section>

          {/* ── パートナーの安心 ── */}
          <section style={{ marginBottom: 26 }}>
            <h2 style={sectionTitle}>パートナーの安心</h2>
            <div style={{ ...card, padding: '16px 18px' }}>
              {[
                '紹介後の対応はすべてMBが担当。先生の手間は増えません。',
                '顧客との関係はそのまま。信頼を損なう対応はしません。',
                '専門外の相談も、“つなげる先がある”状態に。',
              ].map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < 2 ? '1px solid #F2F2F6' : 'none' }}>
                  <span style={{ flexShrink: 0, color: 'var(--green)', fontWeight: 800, fontSize: '.8rem' }}>✓</span>
                  <span style={{ fontSize: '.76rem', lineHeight: 1.7 }}>{t}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── 応募フォーム ── */}
          <section id="apply">
            <h2 style={sectionTitle}>パートナーに応募する</h2>
            {done ? (
              <div style={{ ...card, textAlign: 'center', padding: '34px 24px' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 14 }}>
                  <circle cx="12" cy="12" r="10" stroke="var(--c-blue)" strokeWidth="2" />
                  <path d="M7 12l3.5 3.5L17 8" stroke="var(--c-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 900, marginBottom: 8 }}>応募を受け付けました</h3>
                <p style={{ fontSize: '.74rem', color: 'var(--muted2)', lineHeight: 1.8 }}>ありがとうございます。担当者より個別にご案内いたします。</p>
              </div>
            ) : (
              <form onSubmit={submit} style={card}>
                <div className="fld">
                  <label>お名前 <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" required style={{ minHeight: 44 }} />
                </div>
                <div className="fld">
                  <label>事務所・法人名（任意）</label>
                  <input value={org} onChange={e => setOrg(e.target.value)} placeholder="〇〇会計事務所" style={{ minHeight: 44 }} />
                </div>
                <div className="fld">
                  <label>ご専門・士業区分（任意）</label>
                  <input value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="例：税理士・経営コンサル" style={{ minHeight: 44 }} />
                </div>
                <p style={{ fontSize: '.6rem', color: 'var(--blue-dk)', fontWeight: 600, margin: '0 2px 6px' }}>※ メールか電話のいずれかは必須です</p>
                <div className="fld">
                  <label>メールアドレス</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" autoComplete="off" style={{ minHeight: 44 }} />
                </div>
                <div className="fld">
                  <label>電話番号</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" style={{ minHeight: 44 }} />
                </div>
                <div className="fld">
                  <label>ひとこと（任意）</label>
                  <input value={message} onChange={e => setMessage(e.target.value)} placeholder="例：顧問先からの相談が増えています など" style={{ minHeight: 44 }} />
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                  <input type="checkbox" id="join-consent" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--c-blue)', width: 15, height: 15 }} />
                  <label htmlFor="join-consent" style={{ fontSize: '.66rem', lineHeight: 1.6, color: '#41419E', cursor: 'pointer' }}>
                    <b>Media Birth株式会社からのご連絡に同意します</b>。
                  </label>
                </div>

                {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}

                <button type="submit" disabled={submitting} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', minHeight: 48, fontSize: '.9rem', fontWeight: 800, background: 'linear-gradient(135deg, var(--c-blue), var(--blue-dk))', boxShadow: '0 8px 20px rgba(71,51,230,.28)' }}>
                  {submitting ? '送信中…' : '応募する'}
                </button>
                <p style={{ fontSize: '.6rem', color: 'var(--muted)', textAlign: 'center', marginTop: 12, lineHeight: 1.7 }}>
                  応募いただいても費用は発生しません。担当者より個別にご案内します。
                </p>
              </form>
            )}
          </section>

          <p style={{ fontSize: '.6rem', color: 'var(--muted)', textAlign: 'center', marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            Media Birth株式会社
          </p>
        </div>
      </div>
    </div>
  )
}
