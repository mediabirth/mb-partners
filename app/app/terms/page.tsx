'use client'
import Link from 'next/link'
import { useState } from 'react'

const FAQS = [
  {
    tag: 'Rules', title: '規約の要点',
    body: '・本プログラムは成功報酬制です。報酬は成約時のみ発生し、成約に至らなかった案件(不成立)には報酬は発生しません。\n・報酬はすべて税抜表示です。料率報酬の基準は税抜粗利で、消費税はインボイス登録の有無に応じてお支払い時に別途取り扱います。\n・報酬は成果確定時に発生し、月末締め・翌月末払いです。\n・ご紹介の有効期間は90日です。不成立後90日以内の再成約は元の紹介者に帰属し、超過後は新規扱いとなります。\n・ご紹介は必ずご本人の同意を得てから登録してください。\n・同じ顧客が複数から登録された場合、先に登録した方が優先されます。\n・キャンセル・返金が発生した成果は対象外です。\n・紹介者がさらに紹介者を勧誘して報酬を得る行為(多段階)はできません。\n・解約はいつでも可能です。確定済み報酬はお支払いします。',
    open: true,
  },
  {
    tag: 'FAQ', title: '報酬はいつ入金されますか?',
    body: '成果が確定した月の月末で締め、翌月末にご登録の口座へ振り込みます。明細は報酬タブからいつでも確認・保存できます。',
  },
  {
    tag: 'FAQ', title: '紹介と営業、どちらを選べばいい?',
    body: '迷ったら「紹介」で大丈夫です。つなぐだけで、あとは当社が対応します。商談まで自分で進めたい案件だけ「営業」を選ぶと、報酬が大きくなります。案件ごとに毎回選べます。',
  },
  {
    tag: 'FAQ', title: '紹介した人に迷惑はかかりませんか?',
    body: 'かかりません。ご本人の同意を確認してからのみご連絡し、しつこい営業は行いません。進捗はすべて案件ページで確認できます。',
  },
  {
    tag: 'FAQ', title: '確定申告には何を使えばいい?',
    body: '報酬タブの「年間集計」をご利用ください。源泉所得税(対象報酬のみ)も記載されています。支払調書は対象の方へ翌年1月に発行します。',
  },
]

export default function TermsPage() {
  const [open, setOpen] = useState<number[]>([0]) // first item open by default
  const [subject, setSubject] = useState('報酬・お支払いについて')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  function toggle(i: number) {
    setOpen(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  async function handleSend() {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'other', subject, body }),
      })
      if (res.ok) { setSent(true); setBody('') }
    } finally { setSending(false) }
  }

  return (
    <div>
      <Link href="/app/settings" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, textDecoration: 'none',
      }}>
        ← 設定
      </Link>

      <div style={{ padding: '10px 20px 6px' }}>
        <h2 style={{ fontSize: '.98rem', fontWeight: 500, marginBottom: 12 }}>パートナー規約・ヘルプ</h2>
      </div>

      {FAQS.map((faq, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, margin: '0 20px 10px', overflow: 'hidden' }}>
          <div onClick={() => toggle(i)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '.86rem', fontWeight: 500 }}>
                <small style={{ display: 'block', fontFamily: 'Inter', fontWeight: 500, fontSize: '.5rem', color: 'var(--muted)', letterSpacing: '.22em', marginBottom: 2, textTransform: 'uppercase' }}>{faq.tag}</small>
                {faq.title}
              </h3>
            </div>
            <span style={{
              color: 'var(--muted)', fontSize: '.85rem',
              transition: 'transform .25s', display: 'inline-block',
              transform: open.includes(i) ? 'rotate(90deg)' : 'none',
            }}>›</span>
          </div>
          {open.includes(i) && (
            <div style={{ padding: '0 16px 16px', fontSize: '.72rem', lineHeight: 1.85, color: '#3A3A45', borderTop: '1px solid var(--line)' }}>
              {faq.body.split('\n').map((line, j) => (
                <span key={j}>{line}{j < faq.body.split('\n').length - 1 && <br/>}</span>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Contact form */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, margin: '0 20px 10px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '.86rem', fontWeight: 500 }}>
              <small style={{ display: 'block', fontFamily: 'Inter', fontWeight: 500, fontSize: '.5rem', color: 'var(--muted)', letterSpacing: '.22em', marginBottom: 2, textTransform: 'uppercase' }}>Contact</small>
              お問い合わせ
            </h3>
          </div>
        </div>
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)' }}>
          <p style={{ fontSize: '.72rem', lineHeight: 1.8, marginBottom: 10, marginTop: 8 }}>1営業日以内に、メールと通知でご返信します。</p>

          {sent && (
            <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '10px 12px', fontSize: '.72rem', color: 'var(--green)', marginBottom: 10 }}>
              送信しました。返信をお待ちください。
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>件名</label>
            <select value={subject} onChange={e => setSubject(e.target.value)} style={{
              width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '12px 13px',
              fontFamily: 'inherit', fontSize: '.82rem', background: '#fff',
            }}>
              <option>報酬・お支払いについて</option>
              <option>案件の進捗について</option>
              <option>サービス内容について</option>
              <option>その他</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '.63rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 5 }}>内容</label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              rows={4} placeholder="お困りの内容をご記入ください"
              style={{
                width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '12px 13px',
                fontFamily: 'inherit', fontSize: '.82rem', resize: 'vertical',
              }}
            />
          </div>
          <button onClick={handleSend} disabled={sending || !body.trim()} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%' }}>
            {sending ? '送信中...' : '送信する'}
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
          </button>
        </div>
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}
