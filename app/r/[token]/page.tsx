'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ServiceIcon from '@/components/ServiceIcon'
import { trackFunnel } from '@/lib/funnel-client'

type Menu = { id: string; name: string; short_description: string | null }
// データ由来テキスト(menus.short_description・services.subtitle)の顧客表示時の正規化。
// 内部略語「MB」を対外正典「Media Birth」へ（＝CC生成ではなく正典への正規化）。他の言い換えはしない。
const sanitize = (s: string | null | undefined): string => (s ?? '').replace(/MB\s*Partners/g, 'Media Birth').replace(/MB/g, 'Media Birth')
type LinkInfo = {
  service: { id: string; name: string; subtitle: string | null; icon: string; color: string }
  menus: Menu[]
  referrerName?: string | null
}

// アトリエ/r/ ページスコープ・スタイル。グローバル無波及＝すべて .r-atelier 配下＋新規font-family名のみ。
// 白基調×墨黒・インディゴは署名（リンク/フォーカス/ワードマーク）・角4px・明朝ディスプレイ（サブセット自前ホスト・swap）。
const ATELIER_CSS = `
@font-face{font-family:'RMincho';src:url('/fonts/zen-old-mincho-500.woff2') format('woff2');font-weight:500;font-style:normal;font-display:optional;}
.r-atelier{--ink:#1B1A17;--ink-2:#57544B;--ink-3:#8C887C;--r-line:#E7E5E0;--indigo:#4733E6;min-height:100vh;background:#FFFFFF;color:var(--ink);display:flex;justify-content:center;align-items:flex-start;padding:0;font-feature-settings:'palt' 1;}
.r-wrap{width:100%;max-width:480px;padding:40px 26px 56px;}
.r-mincho{font-family:'RMincho',serif;font-weight:500;letter-spacing:.01em;}
.r-brand{display:flex;align-items:center;gap:8px;font-family:Inter,sans-serif;font-weight:600;font-size:.82rem;color:var(--ink);letter-spacing:.01em;}
.r-brand .p{color:var(--indigo);}
.r-eyebrow{font-family:Inter,sans-serif;font-size:.62rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:34px 0 10px;}
.r-title{font-size:2rem;line-height:1.32;color:var(--ink);margin:0;}
.r-lead{font-size:.82rem;line-height:2;color:var(--ink-2);margin:16px 0 0;}
.r-steps{margin:30px 0 4px;border-top:.5px solid var(--r-line);}
.r-step{display:flex;align-items:flex-start;gap:13px;padding:15px 2px;border-bottom:.5px solid var(--r-line);}
.r-step .n{font-family:Inter,sans-serif;font-size:.74rem;font-weight:600;color:var(--indigo);min-width:14px;font-feature-settings:'tnum';line-height:1.7;}
.r-step .t{font-size:.78rem;font-weight:500;color:var(--ink);line-height:1.7;}
.r-menus{margin:30px 0 4px;}
.r-menus-h{font-size:.92rem;color:var(--ink);margin:0 0 12px;}
.r-menu-list{display:flex;flex-direction:column;gap:8px;}
.r-menu{display:flex;flex-direction:column;gap:2px;text-align:left;width:100%;background:#fff;border:.5px solid #DFDCD4;border-radius:4px;padding:12px 14px;cursor:pointer;transition:border-color .14s,background .14s;}
.r-menu:hover{border-color:#C9C5BB;}
.r-menu.on{border-color:var(--indigo);background:#FBFAFF;}
.r-menu .mn{font-size:.82rem;font-weight:500;color:var(--ink);}
.r-menu .md{font-size:.66rem;color:var(--ink-3);line-height:1.6;}
.r-formhead{font-size:1.02rem;margin:40px 0 6px;color:var(--ink);}
.r-formsub{font-size:.72rem;line-height:1.8;color:var(--ink-2);margin:0 0 22px;}
.r-field{margin-bottom:16px;}
.r-field label{display:block;font-size:11px;font-weight:600;letter-spacing:.02em;color:var(--ink-2);margin-bottom:6px;}
.r-field .req{color:var(--indigo);margin-left:3px;}
.r-field input{width:100%;min-height:46px;border:.5px solid #D8D5CE;border-radius:4px;padding:0 13px;font-family:inherit;font-size:.9rem;color:var(--ink);background:#fff;transition:border-color .15s,box-shadow .15s;}
.r-field input::placeholder{color:#B7B3A9;}
.r-field input:focus{outline:none;border-color:var(--indigo);box-shadow:0 0 0 3px rgba(71,51,230,.12);}
.r-note{font-size:.62rem;color:var(--ink-3);margin:0 2px 8px;}
.r-consent{display:flex;gap:10px;align-items:flex-start;padding:13px 2px;margin:4px 0 4px;}
.r-consent input{margin-top:2px;accent-color:var(--indigo);width:15px;height:15px;flex-shrink:0;}
.r-consent label{font-size:.68rem;line-height:1.7;color:var(--ink-2);cursor:pointer;}
.r-origin{margin:20px 0 4px;padding:13px 0 0;border-top:.5px solid var(--r-line);}
.r-origin .who{font-size:.72rem;color:var(--ink-2);}
.r-origin .who b{font-weight:600;color:var(--ink);}
.r-origin .priv{font-size:.64rem;color:var(--ink-3);margin-top:5px;line-height:1.7;}
.r-cta{width:100%;min-height:50px;margin-top:18px;background:var(--ink);color:#fff;border:none;border-radius:4px;font-family:inherit;font-size:.92rem;font-weight:600;letter-spacing:.02em;cursor:pointer;transition:background .16s,opacity .16s;}
.r-cta:hover:not(:disabled){background:#33302A;}
.r-cta:disabled{opacity:.42;cursor:not-allowed;}
.r-fineprint{font-size:.62rem;color:var(--ink-3);text-align:center;margin:13px 0 0;line-height:1.8;}
.r-footer{margin-top:34px;padding-top:18px;border-top:.5px solid var(--r-line);text-align:center;font-size:.62rem;color:var(--ink-3);line-height:2;}
.r-footer a{color:var(--indigo);text-decoration:none;}
.r-footer a:hover{text-decoration:underline;text-underline-offset:2px;}
.r-svccard{display:flex;align-items:center;gap:12px;margin:20px 0 0;}
.r-svccard .nm{font-size:.78rem;font-weight:600;color:var(--ink);}
.r-svccard .st{font-size:.62rem;color:var(--ink-3);margin-top:2px;line-height:1.6;}
.r-center{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;background:#FFFFFF;text-align:center;}
.r-error{color:var(--red);font-size:.72rem;margin:2px 0 10px;}
`

export default function ReferralLandingPage() {
  const params      = useParams()
  const searchParams = useSearchParams()
  const token = params.token as string
  const via   = searchParams.get('via') ?? 'link'
  const linkedMenuId = searchParams.get('m') ?? ''   // パートナーがメニュー単位で共有した場合のみ付く（?m=）

  const [info, setInfo]         = useState<LinkInfo | null>(null)
  const [pickedMenu, setPickedMenu] = useState<string>('')   // ブランドリンクで顧客が選んだメニュー（表示・memo用・money非接触）
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
          // 会社名があれば一覧/コンソールの主体＝会社名（既存の表示規約に合わせる）。token帰属は API 側で不変。
          customerName: company || person,
          companyName: company,
          contactName: person,
          contactTitle: contactTitle.trim(),
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

  if (loading) return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style><link rel="preload" href="/fonts/zen-old-mincho-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <div className="r-center"><div style={{ fontSize: '.8rem', color: 'var(--ink-3)' }}>読み込み中…</div></div>
    </div>
  )

  if (notFound) return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style><link rel="preload" href="/fonts/zen-old-mincho-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <div className="r-center">
        <h2 className="r-mincho" style={{ fontSize: '1.4rem', marginBottom: 10 }}>リンクが見つかりません</h2>
        <p style={{ fontSize: '.76rem', color: 'var(--ink-2)', lineHeight: 1.9 }}>
          このリンクは無効または期限切れです。<br/>ご紹介者にご確認ください。
        </p>
      </div>
    </div>
  )

  if (done) return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style><link rel="preload" href="/fonts/zen-old-mincho-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
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

  const partnerName = (info?.referrerName ?? '').trim()
  const menus = info?.menus ?? []
  // メニュー単位リンク(?m=)＝そのメニューが見出し。ブランドリンク＝ブランド名が見出し＋一覧を提示。
  //   ＝パートナーが明示選択したメニューだけが主役。非選択メニューが勝手に主役化することは構造的に起きない。
  const linkedMenu = menus.find(m => m.id === linkedMenuId) ?? null
  const chosen = linkedMenu ?? menus.find(m => m.id === pickedMenu) ?? null
  const bigTitle = linkedMenu?.name?.trim() || info?.service.name?.trim() || 'ご相談'
  const lead = sanitize((chosen?.short_description ?? info?.service.subtitle)?.trim() || null) || null

  return (
    <div className="r-atelier"><style>{ATELIER_CSS}</style><link rel="preload" href="/fonts/zen-old-mincho-500.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <div className="r-wrap">
        {/* 1. 小さなワードマーク */}
        <div className="r-brand">
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
            <rect x="6" y="6" width="14" height="14" rx="3" stroke="var(--ink)" strokeWidth="3"/>
            <rect x="28" y="6" width="14" height="14" rx="7" stroke="var(--ink)" strokeWidth="3"/>
            <rect x="6" y="28" width="14" height="14" rx="7" stroke="#B7B3A9" strokeWidth="3"/>
            <rect x="28" y="28" width="14" height="14" rx="3" fill="var(--indigo)"/>
          </svg>
          <span>Media <span className="p">Birth</span></span>
        </div>

        {/* 2. 見出し：メニュー単位リンクはメニュー名／ブランドリンクはブランド名（明朝・大） */}
        <div className="r-eyebrow">{info?.service.name ?? 'ご相談'}</div>
        <h1 className="r-mincho r-title">{bigTitle}</h1>
        {lead && <p className="r-lead">{lead}</p>}

        {/* サービス識別 */}
        {info && (
          <div className="r-svccard">
            <ServiceIcon icon={info.service.icon} color={info.service.color} size={38} />
            <div style={{ minWidth: 0 }}>
              <div className="nm">{info.service.name}</div>
              <div className="st">{chosen ? `${chosen.name} のご相談を承ります` : 'ご相談を承ります'}</div>
            </div>
          </div>
        )}

        {/* 3. ブランドリンク時：正典のメニュー一覧を提示（顧客が選べる形）。メニュー単位リンク時は非表示。 */}
        {!linkedMenu && menus.length > 0 && (
          <div className="r-menus">
            <div className="r-menus-h r-mincho">ご相談メニュー</div>
            <div className="r-menu-list">
              {menus.map(m => {
                const on = pickedMenu === m.id
                return (
                  <button type="button" key={m.id} onClick={() => setPickedMenu(on ? '' : m.id)} className={`r-menu${on ? ' on' : ''}`}>
                    <span className="mn">{m.name}</span>
                    {m.short_description && <span className="md">{sanitize(m.short_description)}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 4. 安心3ステップ（正典文言・静音・番号＋細罫線） */}
        <div className="r-steps">
          {[
            { n: '1', t: 'ご相談内容を確認のうえ、Media Birth の担当者からご連絡します' },
            { n: '2', t: '状況を伺い、お客さまに合わせたご提案をします' },
            { n: '3', t: 'ご納得いただけてから、正式にスタートします' },
          ].map(s => (
            <div key={s.n} className="r-step">
              <span className="n">{s.n}</span>
              <span className="t">{s.t}</span>
            </div>
          ))}
        </div>

        {/* 5. 入力フォーム（クリーンなフィールド・ラベル11px） */}
        <div className="r-formhead r-mincho">お問い合わせ</div>
        <p className="r-formsub">下記をご入力のうえ送信してください。担当者より追ってご連絡いたします。</p>

        <form onSubmit={handleSubmit}>
          <div className="r-field">
            <label>会社名（任意）</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" />
          </div>
          <div className="r-field">
            <label>ご担当者名<span className="req">*</span></label>
            <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" required />
          </div>
          <div className="r-field">
            <label>部署・役職（任意）</label>
            <input value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="例：営業部 部長" />
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

          {/* 6. 出自の一行＋非共有の明示（実名ヒーロー＋アバターは廃止・帰属は token のまま不変） */}
          {partnerName && (
            <div className="r-origin">
              <div className="who">ご案内：<b>{partnerName}</b> さん</div>
              <div className="priv">ご相談の内容がご紹介者へ共有されることはありません。</div>
            </div>
          )}

          {error && <p className="r-error">{error}</p>}

          {/* 7. CTA＝墨の塗りボタン（「無料」の語はページ全体で不使用） */}
          <button type="submit" disabled={submitting || !consent} className="r-cta">
            {submitting ? '送信中…' : '相談する'}
          </button>
          <p className="r-fineprint">内容を確認のうえ、担当者よりご連絡します。</p>
        </form>

        {/* 8. フッター（運営者情報・プライバシー） */}
        <div className="r-footer">
          株式会社Media Birth ・ パートナープログラム<br/>
          <a href="/legal/privacy">プライバシーポリシー</a>
        </div>
      </div>
    </div>
  )
}
