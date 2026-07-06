'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'
import { trackFunnel } from '@/lib/funnel-client'

type Menu = { id: string; name: string; public_description: string | null }
type LinkInfo = {
  service: { id: string; name: string; icon: string; color: string; image_url: string | null }
  menus: Menu[]
}

// アトリエ/r/ 第3稿：サービス自身の清潔な相談ページ（紹介の機構は透けさせない）。ページスコープ完結。
// 白×墨黒・インディゴは署名（リンク/フォーカス）・角4px・明朝は表題のみ（控えめ）。顧客向けの言葉だけを置く。
const ATELIER_CSS = `
@font-face{font-family:'RMincho';src:url('/fonts/zen-old-mincho-500.woff2') format('woff2');font-weight:500;font-style:normal;font-display:optional;}
.r-atelier{--ink:#1B1A17;--ink-2:#57544B;--ink-3:#8C887C;--r-line:#E7E5E0;--indigo:#4733E6;min-height:100vh;background:#FFFFFF;color:var(--ink);display:flex;justify-content:center;align-items:flex-start;padding:0;font-feature-settings:'palt' 1;}
.r-wrap{width:100%;max-width:480px;padding:34px 26px 56px;}
.r-mincho{font-family:'RMincho',serif;font-weight:500;letter-spacing:.01em;}
.r-svchead{display:flex;align-items:center;gap:10px;}
.r-svchead .nm{font-size:.86rem;font-weight:600;color:var(--ink);letter-spacing:.01em;}
.r-hero{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;margin-top:20px;display:block;background:#F4F2EE;}
.r-title{font-size:1.5rem;line-height:1.4;color:var(--ink);margin:24px 0 0;}
.r-lead{font-size:.82rem;line-height:2;color:var(--ink-2);margin:14px 0 0;}
.r-menus{margin:28px 0 4px;}
.r-menus-h{font-size:.82rem;font-weight:600;color:var(--ink-3);letter-spacing:.06em;margin:0 0 12px;}
.r-menu-list{display:flex;flex-direction:column;gap:8px;}
.r-menu{display:flex;flex-direction:column;gap:3px;text-align:left;width:100%;background:#fff;border:.5px solid #DFDCD4;border-radius:4px;padding:13px 15px;cursor:pointer;transition:border-color .14s,background .14s;}
.r-menu:hover{border-color:#C9C5BB;}
.r-menu.on{border-color:var(--indigo);background:#FBFAFF;}
.r-menu .mn{font-size:.84rem;font-weight:500;color:var(--ink);}
.r-menu .md{font-size:.68rem;color:var(--ink-3);line-height:1.7;}
.r-steps{margin:32px 0 4px;border-top:.5px solid var(--r-line);}
.r-step{display:flex;align-items:flex-start;gap:13px;padding:15px 2px;border-bottom:.5px solid var(--r-line);}
.r-step .n{font-family:Inter,sans-serif;font-size:.74rem;font-weight:600;color:var(--indigo);min-width:14px;font-feature-settings:'tnum';line-height:1.7;}
.r-step .t{font-size:.78rem;font-weight:500;color:var(--ink);line-height:1.7;}
.r-formhead{font-size:1.02rem;margin:40px 0 6px;color:var(--ink);}
.r-formsub{font-size:.72rem;line-height:1.8;color:var(--ink-2);margin:0 0 22px;}
.r-field{margin-bottom:16px;}
.r-field label{display:block;font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--ink-2);margin-bottom:6px;}
.r-field .req{color:var(--indigo);margin-left:3px;}
.r-field input{width:100%;min-height:46px;border:.5px solid #D8D5CE;border-radius:4px;padding:0 13px;font-family:inherit;font-size:.9rem;color:var(--ink);background:#fff;transition:border-color .15s,box-shadow .15s;}
.r-field input::placeholder{color:#B7B3A9;}
.r-field input:focus{outline:none;border-color:var(--indigo);box-shadow:0 0 0 3px rgba(71,51,230,.12);}
.r-note{font-size:.62rem;color:var(--ink-3);margin:0 2px 8px;}
.r-consent{display:flex;gap:10px;align-items:flex-start;padding:15px 2px 4px;margin:4px 0 4px;border-top:.5px solid var(--r-line);}
.r-consent input{margin-top:2px;accent-color:var(--indigo);width:15px;height:15px;flex-shrink:0;}
.r-consent label{font-size:.68rem;line-height:1.7;color:var(--ink-2);cursor:pointer;}
.r-cta{width:100%;min-height:50px;margin-top:18px;background:var(--ink);color:#fff;border:none;border-radius:4px;font-family:inherit;font-size:.92rem;font-weight:600;letter-spacing:.02em;cursor:pointer;transition:background .16s,opacity .16s;}
.r-cta:hover:not(:disabled){background:#33302A;}
.r-cta:disabled{opacity:.42;cursor:not-allowed;}
.r-fineprint{font-size:.62rem;color:var(--ink-3);text-align:center;margin:13px 0 0;line-height:1.8;}
.r-footer{margin-top:34px;padding-top:18px;border-top:.5px solid var(--r-line);text-align:center;font-size:.62rem;color:var(--ink-3);line-height:2;}
.r-footer a{color:var(--indigo);text-decoration:none;}
.r-footer a:hover{text-decoration:underline;text-underline-offset:2px;}
.r-center{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;background:#FFFFFF;text-align:center;}
.r-error{color:var(--red);font-size:.72rem;margin:2px 0 10px;}
`

const fallbackDesc = (name: string) => `${name}についてのご相談を承ります`

export default function ReferralLandingPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const via   = searchParams.get('via') ?? 'link'
  const linkedMenuId = searchParams.get('m') ?? ''

  const [info, setInfo]         = useState<LinkInfo | null>(null)
  const [pickedMenu, setPickedMenu] = useState<string>('')
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [companyName, setCompanyName]   = useState('')
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [email, setEmail]       = useState('')
  const [memo, setMemo]         = useState('')
  const [consent, setConsent]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    trackFunnel('landing_view', { token })
    fetch(`/api/referral/info?token=${token}`)
      .then(r => r.json())
      .then(d => { if (d.error) { setNotFound(true); return } setInfo(d) })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const person = name.trim()
    const company = companyName.trim()
    if (!person) { setError('お名前を入力してください'); return }
    if (!email.trim() && !phone.trim()) { setError('ご連絡のため、メールか電話のいずれかを入力してください'); return }
    if (!consent) { setError('同意確認が必要です'); return }
    // 選択メニュー名（メニュー単位リンク or 顧客がページで選択）を memo に添える。money・帰属には非接触。
    const chosenId = linkedMenuId || pickedMenu
    const chosenMenuName = (info?.menus ?? []).find(m => m.id === chosenId)?.name ?? null
    setSubmitting(true)
    try {
      const res = await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          customerName: company || person,
          companyName: company,
          contactName: person,
          customerEmail: email.trim(),
          customerType: company ? 'corporate' : 'individual',
          phone, memo: chosenMenuName ? [`ご相談メニュー: ${chosenMenuName}`, memo].filter(Boolean).join('\n') : memo, via,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '送信に失敗しました'); return }
      setDone(true)
    } catch {
      setError('送信に失敗しました。時間をおいて再度お試しください')
    } finally {
      setSubmitting(false)
    }
  }

  const preload = <link rel="preload" href="/fonts/zen-old-mincho-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />

  if (loading) return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style>{preload}
      <div className="r-center"><div style={{ fontSize: '.8rem', color: 'var(--ink-3)' }}>読み込み中…</div></div>
    </div>
  )

  if (notFound) return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style>{preload}
      <div className="r-center">
        <h2 className="r-mincho" style={{ fontSize: '1.4rem', marginBottom: 10 }}>リンクが見つかりません</h2>
        <p style={{ fontSize: '.76rem', color: 'var(--ink-2)', lineHeight: 1.9 }}>
          このリンクは無効または期限切れです。
        </p>
      </div>
    </div>
  )

  if (done) return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style>{preload}
      <div className="r-center">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 18 }}>
          <circle cx="12" cy="12" r="10" stroke="var(--indigo)" strokeWidth="1.4"/>
          <path d="M7 12l3.5 3.5L17 8" stroke="var(--indigo)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h2 className="r-mincho" style={{ fontSize: '1.5rem', marginBottom: 12 }}>承りました</h2>
        <p style={{ fontSize: '.78rem', color: 'var(--ink-2)', lineHeight: 2, maxWidth: 320 }}>
          お問い合わせいただきありがとうございます。<br/>
          <b style={{ fontWeight: 600, color: 'var(--ink)' }}>2〜3営業日以内</b>に、Media Birth の担当者よりご連絡いたします。
        </p>
      </div>
    </div>
  )

  const menus = info?.menus ?? []
  const linkedMenu = menus.find(m => m.id === linkedMenuId) ?? null
  // メニュー単位リンク＝そのメニューが表題。ブランドリンク＝サービス名が表題＋メニュー一覧。非選択メニューの主役化は起きない。
  const heading = linkedMenu?.name?.trim() || info?.service.name?.trim() || 'ご相談'
  const lead = linkedMenu ? (linkedMenu.public_description?.trim() || fallbackDesc(linkedMenu.name)) : null
  const imageUrl = info?.service.image_url?.trim() || null

  return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style>{preload}
      <div className="r-wrap">
        {/* このページの顔＝サービス（ロゴ＋名称・小） */}
        {info && (
          <div className="r-svchead">
            <ServiceIcon icon={info.service.icon} color={info.service.color} size={30} />
            <span className="nm">{info.service.name}</span>
          </div>
        )}

        {/* ヒーロー画像（services.image_url・未設定なら画像ブロック自体を出さない） */}
        {imageUrl && <img className="r-hero" src={imageUrl} alt={info?.service.name ?? ''} />}

        {/* 表題（明朝・控えめ）＝メニュー名 or サービス名 */}
        <h1 className="r-mincho r-title">{heading}</h1>
        {lead && <p className="r-lead">{lead}</p>}

        {/* ブランドリンク時：顧客向けメニュー一覧（public_description のみ／空はフォールバック1行）。 */}
        {!linkedMenu && menus.length > 0 && (
          <div className="r-menus">
            <div className="r-menus-h">ご相談メニュー</div>
            <div className="r-menu-list">
              {menus.map(m => {
                const on = pickedMenu === m.id
                return (
                  <button type="button" key={m.id} onClick={() => setPickedMenu(on ? '' : m.id)} className={`r-menu${on ? ' on' : ''}`}>
                    <span className="mn">{m.name}</span>
                    <span className="md">{m.public_description?.trim() || fallbackDesc(m.name)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 進め方（正典文言・社名を含めない） */}
        <div className="r-steps">
          {[
            { n: '1', t: 'ご相談内容を確認のうえ、担当者からご連絡します' },
            { n: '2', t: '状況を伺い、お客さまに合わせたご提案をします' },
            { n: '3', t: 'ご納得いただけてから、正式にスタートします' },
          ].map(s => (
            <div key={s.n} className="r-step">
              <span className="n">{s.n}</span>
              <span className="t">{s.t}</span>
            </div>
          ))}
        </div>

        {/* お問い合わせ */}
        <div className="r-formhead r-mincho">お問い合わせ</div>
        <p className="r-formsub">下記をご入力のうえ送信してください。担当者より追ってご連絡いたします。</p>

        <form onSubmit={handleSubmit}>
          <div className="r-field">
            <label>お名前<span className="req">*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" required />
          </div>
          <div className="r-field">
            <label>会社名（任意）</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" />
          </div>
          <p className="r-note">※ メールか電話のいずれかをご記入ください</p>
          <div className="r-field">
            <label>電話番号</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" />
          </div>
          <div className="r-field">
            <label>メールアドレス</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" autoComplete="off" />
          </div>
          <div className="r-field">
            <label>ご相談内容・メモ（任意）</label>
            <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="例：来期の集客強化を検討中 など" />
          </div>

          <div className="r-consent">
            <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <label htmlFor="consent">
              株式会社Media Birth からのご連絡に同意します。いただいた情報はご提案のためにのみ使用します。
            </label>
          </div>

          {error && <p className="r-error">{error}</p>}

          <button type="submit" disabled={submitting || !consent} className="r-cta">
            {submitting ? '送信中…' : '相談する'}
          </button>
          <p className="r-fineprint">内容を確認のうえ、担当者よりご連絡します。</p>
        </form>

        {/* フッター */}
        <div className="r-footer">
          株式会社Media Birth<br/>
          <a href="/legal/privacy">プライバシーポリシー</a>
        </div>
      </div>
    </div>
  )
}
