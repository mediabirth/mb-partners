'use client'
import { useState } from 'react'

// Feature E（E-1）：仲間（プロ紹介者）を招待する導線。共有リンク＝ /join?ref=<ログイン中partner_id>。
// ★非金銭・賞賛のための導線。報酬額/条件/件数は一切表示しない。/r の顧客紹介(お金)とは別物。
// コピー/共有のみ（リンク生成は partnerId をクエリに載せるだけ・新規の金額計算なし）。
export default function InviteFellowCard({ partnerId }: { partnerId: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? `${window.location.origin}/join?ref=${partnerId}` : `/join?ref=${partnerId}`

  function copy() {
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  function shareMail() {
    const subject = 'MB Partners 紹介パートナーのご案内'
    const body = [
      'いつもお世話になっております。',
      '',
      'わたしが信頼しているMB Partnersの紹介パートナー制度をご案内します。',
      'ご自身の人脈・顧問先を、無理なく成果につなげられる仕組みです。',
      'よろしければ下記からご覧ください。',
      url,
      '',
      'あなたとご一緒できれば嬉しいです。',
    ].join('\n')
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
  function shareLine() {
    const text = ['信頼できる方にだけお声がけしています。MB Partners の紹介パートナー制度です。', url].join('\n')
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  return (
    <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-bg2)', color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" strokeLinecap="round" /></svg>
        </span>
        <b style={{ fontSize: '.84rem', fontWeight: 800 }}>MB Partnersへ知り合いを推薦する</b>
      </div>
      <p style={{ fontSize: '.66rem', color: 'var(--muted2)', lineHeight: 1.7, margin: '0 0 12px' }}>
        MB Partners は完全招待制です。どなたでも始められるものではなく、信頼できる知り合いをあなたから推薦いただけます。推薦は、あなたが築いてきた信頼の証です。
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.68rem', fontFamily: 'Inter', fontWeight: 600 }}>
          {url.replace(/^https?:\/\//, '')}
        </span>
        <button onClick={copy} style={{ fontFamily: 'Inter', fontSize: '.54rem', letterSpacing: '.1em', background: copied ? 'var(--green)' : 'var(--blue)', color: '#fff', border: 'none', borderRadius: 5, padding: '6px 12px', cursor: 'pointer', flexShrink: 0, fontWeight: 700 }}>
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={shareMail} className="btn btn-p lift" style={{ flex: 1, minHeight: 42, fontSize: '.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          メール
        </button>
        <button onClick={shareLine} className="lift" style={{ flex: 1, minHeight: 42, background: '#06C755', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.07.7.2.8.5.07.27.05.7.02.97l-.13.8c-.04.24-.2.94.82.51 1.02-.43 5.5-3.24 7.5-5.55C20.6 14.9 22 13.1 22 11c0-4.4-4.5-8-10-8z" /></svg>
          LINE
        </button>
      </div>
    </div>
  )
}
