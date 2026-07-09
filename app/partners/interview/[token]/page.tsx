'use client'
/**
 * パートナー応募者の面談予約ページ（公開・認証不要／interview_token が鍵）。
 * LPの世界観（グラデ光＋ブランドマーク＋グラスカード）。SlotPicker流用で枠を選び、確定でMeet自動発行。
 * ★money/auth/deals 非接触。/api/partners/interview/[token]/availability・/book のみ。
 */
import { use, useEffect, useState } from 'react'
import SlotPicker, { type Slot, type Day } from '@/components/SlotPicker'
import BrandMark from '@/components/ui/BrandMark'

const fmtConfirm = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleString('ja', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
}

const CSS = `
.iv{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;padding:clamp(28px,6vh,64px) 20px;position:relative;overflow:hidden;
  font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:#1a1830;}
.iv *{box-sizing:border-box;margin:0;}
.iv-card{position:relative;z-index:2;width:100%;max-width:520px;
  background:rgba(255,255,255,.7);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);
  border:0.5px solid rgba(255,255,255,.85);border-radius:22px;box-shadow:0 20px 60px rgba(40,30,80,.10);padding:clamp(26px,5vw,40px);animation:ivUp .6s cubic-bezier(.22,1,.36,1) both;}
@keyframes ivUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.iv-brand{display:flex;align-items:center;gap:10px;margin-bottom:20px;}
.iv-brand b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .iv-brand b span{color:#5646e6;}
.iv-kicker{font-size:.68rem;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:#5646e6;}
.iv-h1{margin-top:8px;font-size:clamp(1.4rem,4vw,1.8rem);font-weight:800;line-height:1.35;letter-spacing:-.03em;text-wrap:balance;}
.iv-lead{margin-top:12px;font-size:.86rem;line-height:1.85;color:#54506e;}
.iv-sec{margin-top:22px;}
.iv-confirm{margin-top:20px;display:flex;flex-direction:column;gap:12px;}
.iv-selected{font-size:.86rem;font-weight:700;color:#2b2550;padding:12px 16px;border-radius:12px;background:rgba(86,70,230,.07);border:0.5px solid rgba(86,70,230,.16);}
.iv-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;height:52px;border:none;border-radius:14px;cursor:pointer;
  background:linear-gradient(135deg,#5646E6,#6f5cf0);color:#fff;font-size:.95rem;font-weight:800;font-family:inherit;box-shadow:0 14px 30px rgba(86,70,230,.28);transition:transform .15s,opacity .15s;}
.iv-btn:hover{transform:translateY(-1px);} .iv-btn:disabled{opacity:.55;cursor:default;transform:none;}
.iv-err{font-size:.76rem;color:#d64545;margin-top:4px;}
.iv-muted{font-size:.72rem;color:#9a95b0;line-height:1.7;margin-top:14px;}
.iv-done{text-align:center;padding:8px 0;}
.iv-badge{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#15b37e,#0f9d76);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 10px 26px rgba(21,145,126,.35);animation:ivPop .7s cubic-bezier(.34,1.56,.64,1) both;}
@keyframes ivPop{0%{transform:scale(.3);opacity:0}100%{transform:scale(1);opacity:1}}
.iv-meet{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:18px;height:48px;padding:0 22px;border-radius:12px;background:#5646e6;color:#fff;font-size:.86rem;font-weight:800;text-decoration:none;}
.iv-skel{height:180px;border-radius:12px;background:linear-gradient(90deg,rgba(86,70,230,.06),rgba(86,70,230,.12),rgba(86,70,230,.06));background-size:200% 100%;animation:ivShim 1.3s linear infinite;}
@keyframes ivShim{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.iv *{animation:none!important}}
`

type State =
  | { kind: 'loading' }
  | { kind: 'error'; msg: string }
  | { kind: 'pick'; name: string | null; days: Day[]; nextDay: string | null }
  | { kind: 'already'; name: string | null; status: string; when: string | null; meetingUrl: string | null }
  | { kind: 'done'; when: string; meetingUrl: string | null }

export default function InterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [st, setSt] = useState<State>({ kind: 'loading' })
  const [selDate, setSelDate] = useState<string | null>(null)
  const [selSlot, setSelSlot] = useState<Slot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/partners/interview/${token}/availability`)
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) return setSt({ kind: 'error', msg: d?.error === 'not found' ? 'このリンクは無効です。' : '空き枠を取得できませんでした。' })
        if (d.status && d.status !== 'applied') {
          return setSt({ kind: 'already', name: d.name ?? null, status: d.status, when: d.interview_at ?? null, meetingUrl: d.meetingUrl ?? null })
        }
        setSt({ kind: 'pick', name: d.name ?? null, days: d.days ?? [], nextDay: d.nextDay ?? null })
        setSelDate(d.nextDay ?? null)
      })
      .catch(() => setSt({ kind: 'error', msg: '通信に失敗しました。' }))
  }, [token])

  async function confirm() {
    if (!selSlot || submitting) return
    setSubmitting(true); setErr('')
    try {
      const r = await fetch(`/api/partners/interview/${token}/book`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start_at: selSlot.start, end_at: selSlot.end }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d?.error || '予約に失敗しました。'); setSubmitting(false); return }
      setSt({ kind: 'done', when: fmtConfirm(selSlot.start), meetingUrl: d.meetingUrl ?? null })
    } catch { setErr('通信に失敗しました。'); setSubmitting(false) }
  }

  return (
    <main className="iv mb-field-bg">
      <style>{CSS}</style>
      <div className="iv-card">
        <div className="iv-brand"><BrandMark size={26} /><b>MB<span> Partners</span></b></div>

        {st.kind === 'loading' && (<><div className="iv-kicker">Interview</div><h1 className="iv-h1">面談のご予約</h1><div className="iv-sec iv-skel" /></>)}

        {st.kind === 'error' && (<><div className="iv-kicker">Interview</div><h1 className="iv-h1">ご予約リンク</h1><p className="iv-lead">{st.msg}<br />お手数ですが、応募完了メールのリンクを再度ご確認ください。</p></>)}

        {st.kind === 'already' && (
          <>
            <div className="iv-kicker">Interview</div>
            <h1 className="iv-h1">{st.status === 'interview_booked' ? '面談は予約済みです' : 'ご予約を承っています'}</h1>
            {st.status === 'interview_booked' ? (
              <>
                <p className="iv-lead">{st.name ? `${st.name} 様、` : ''}面談のご予約を承っております。当日はどうぞよろしくお願いいたします。</p>
                {st.when && <div className="iv-selected" style={{ marginTop: 16 }}>🗓 {fmtConfirm(st.when)}</div>}
                {st.meetingUrl
                  ? <a className="iv-meet" href={st.meetingUrl} target="_blank" rel="noreferrer">オンライン会議に参加する</a>
                  : <p className="iv-muted">オンライン会議のURLは、面談日が近づきましたら担当より改めてメールでお送りします。</p>}
                <p className="iv-muted">日時のご変更をご希望の場合は、応募完了メールへご返信ください。</p>
              </>
            ) : (
              <p className="iv-lead">この度はご応募ありがとうございます。担当より順次ご連絡いたします。</p>
            )}
          </>
        )}

        {st.kind === 'pick' && (
          <>
            <div className="iv-kicker">Interview</div>
            <h1 className="iv-h1">{st.name ? `${st.name} 様、` : ''}面談のご予約</h1>
            <p className="iv-lead">まずは一度、オンラインで顔合わせをさせてください（所要 30 分・Google Meet）。ご都合のよい日時をお選びください。</p>
            <div className="iv-sec">
              {st.days.length === 0
                ? <p className="iv-lead">現在ご案内できる空き枠がありません。お手数ですが時間をおいて再度お試しください。</p>
                : <SlotPicker days={st.days} selectedDate={selDate} selectedSlot={selSlot} onSelectDate={setSelDate} onSelectSlot={setSelSlot} />}
            </div>
            {selSlot && (
              <div className="iv-confirm">
                <div className="iv-selected">🗓 {fmtConfirm(selSlot.start)}</div>
                <button className="iv-btn" onClick={confirm} disabled={submitting}>{submitting ? '予約中…' : 'この日時で面談を予約する'}</button>
                {err && <p className="iv-err">{err}</p>}
              </div>
            )}
            <p className="iv-muted">MB Partners は、ご紹介いただく信頼をお預かりするプログラムです。面談を経て、パートナーとしてお迎えします。</p>
          </>
        )}

        {st.kind === 'done' && (
          <div className="iv-done">
            <div className="iv-badge"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <div className="iv-kicker">Booked</div>
            <h1 className="iv-h1">面談のご予約を承りました</h1>
            <div className="iv-selected" style={{ marginTop: 16, textAlign: 'center' }}>🗓 {st.when}</div>
            <p className="iv-lead">確認のメールをお送りしました。当日はどうぞよろしくお願いいたします。</p>
            {st.meetingUrl
              ? <a className="iv-meet" href={st.meetingUrl} target="_blank" rel="noreferrer">オンライン会議に参加する</a>
              : <p className="iv-muted">オンライン会議のURLは、面談日が近づきましたら担当より改めてメールでお送りします。</p>}
          </div>
        )}
      </div>
    </main>
  )
}
