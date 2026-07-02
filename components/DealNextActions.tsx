'use client'
import { useEffect, useRef, useState } from 'react'
import BookingDrawer from '@/components/BookingDrawer'

// v2 案件ページ＝実行の場：「次にやること」（リンク送付 or 予約）＋ヒヤリング（保存で協力タスク自動チェック）。
// ★リンクは現行生成のまま（/r/token・/book/partnerCode）を受け取って表示するだけ。deal本体・money非接触。
export default function DealNextActions({
  dealId, method, hasAppointment, registerUrl, bookingUrl, customerEmail,
  serviceName, defaultContact, defaultNeed, hearingEnabled, hearingInitial, hearingDone,
}: {
  dealId: string
  method: 'send' | 'self'
  hasAppointment: boolean
  registerUrl: string | null
  bookingUrl: string | null
  customerEmail: string | null
  serviceName: string | null
  defaultContact: string
  defaultNeed: string
  hearingEnabled: boolean
  hearingInitial: string
  hearingDone: boolean
}) {
  const shareUrl = hasAppointment ? bookingUrl : registerUrl
  const [showBooking, setShowBooking] = useState(false)
  const [booked, setBooked] = useState<string | null>(null)

  return (
    <div style={{ padding: '16px 20px 0' }}>
      {/* ── 次にやること（最上部・2px accent枠・1つだけ） ── */}
      {method === 'send' && shareUrl && (
        <NextBox title={hasAppointment ? 'お客さまに面談日時調整リンクを送る' : 'お客さまに登録リンクを送る'}
          desc={hasAppointment ? 'お客さまがカレンダーから日時を選べます。' : 'お客さまがご自身で入力します。その後はMBが対応します。'}>
          <ShareLink url={shareUrl} serviceName={serviceName} defaultContact={defaultContact} defaultNeed={defaultNeed} />
        </NextBox>
      )}
      {method === 'self' && hasAppointment && (
        <NextBox title="面談日時を予約する" desc="空き枠から日時を選んで、この案件の商談を設定します。">
          {booked ? (
            <p style={{ fontSize: '.72rem', color: 'var(--green)', fontWeight: 700, margin: 0 }}>
              ✓ 商談 {new Date(booked).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} を設定しました
            </p>
          ) : (
            <button onClick={() => setShowBooking(true)} className="ui-btn ui-btn--primary ui-btn--lg lift" style={{ width: '100%' }}>面談日時を予約する</button>
          )}
        </NextBox>
      )}
      {method === 'self' && !hasAppointment && (
        <NextBox title="MBが対応します" desc="ご紹介ありがとうございます。この後はMBがお客さまへご連絡します。次にやることはありません。" />
      )}

      {/* ── あなたのタスク：ヒヤリング（保存で協力タスク「ヒヤリング」を自動チェック） ── */}
      {hearingEnabled && <HearingBox dealId={dealId} initial={hearingInitial} initiallyDone={hearingDone} />}

      {showBooking && (
        <BookingDrawer dealId={dealId} defaultCustomerEmail={customerEmail}
          onClose={() => setShowBooking(false)} onConfirmed={(at) => { setShowBooking(false); setBooked(at) }} />
      )}
    </div>
  )
}

function NextBox({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--blue-bg2)', border: '2px solid var(--c-blue)', borderRadius: 14, padding: '15px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: '.54rem', fontWeight: 800, color: '#fff', background: 'var(--c-blue)', borderRadius: 5, padding: '2px 7px', letterSpacing: '.04em' }}>次にやること</span>
        <b style={{ fontSize: '.84rem', color: 'var(--blue-dk)' }}>{title}</b>
      </div>
      <p style={{ fontSize: '.63rem', color: '#52529E', margin: '0 0 12px', lineHeight: 1.6 }}>{desc}</p>
      {children}
    </div>
  )
}

// リンク＋コピー＋メール／LINE／QR＋AIで送る文面を作る。
function ShareLink({ url, serviceName, defaultContact, defaultNeed }: { url: string; serviceName: string | null; defaultContact: string; defaultNeed: string }) {
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const bareUrl = url.replace(/^https?:\/\//, '')
  const mailHref = `mailto:?subject=${encodeURIComponent('ご事業に役立つ専門サービスのご紹介')}&body=${encodeURIComponent(['お世話になっております。', '', '下記より詳細をご確認ください。', url, '', '何卒よろしくお願い申し上げます。'].join('\n'))}`
  const lineHref = `https://line.me/R/share?text=${encodeURIComponent(['専門サービスのご紹介です。', url].join('\n'))}`
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 8, padding: '11px 12px', marginBottom: 8 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '.7rem', fontFamily: 'Inter', fontWeight: 600 }}>{bareUrl}</span>
        <button onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
          style={{ fontFamily: 'Inter', fontSize: '.55rem', letterSpacing: '.1em', background: copied ? 'var(--green)' : 'var(--c-blue)', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', flexShrink: 0 }}>
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <a href={mailHref} className="ui-btn ui-btn--primary ui-btn--lg lift" style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, textDecoration: 'none' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
        メールで送る
      </a>
      <a href={lineHref} target="_blank" rel="noopener" className="lift" style={{ width: '100%', minHeight: 44, background: '#06C755', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'inherit', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, textDecoration: 'none' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.07.7.2.8.5.07.27.05.7.02.97l-.13.8c-.04.24-.2.94.82.51 1.02-.43 5.5-3.24 7.5-5.55C20.6 14.9 22 13.1 22 11c0-4.4-4.5-8-10-8z"/></svg>
        LINEで送る
      </a>
      <button onClick={() => setShowQR(v => !v)} className="ui-btn ui-btn--primary ui-btn--lg lift" style={{ width: '100%' }}>QRコードを表示</button>
      {showQR && <QRModal linkUrl={url} onClose={() => setShowQR(false)} />}
      <div style={{ marginTop: 10 }}>
        <AiIntroPanel defaultContact={defaultContact} defaultService={serviceName ?? ''} defaultNeed={defaultNeed} />
      </div>
    </>
  )
}

// ヒヤリング入力：保存すると /api/app/deals/[id]/hearing 経由で協力タスク「ヒヤリング」を自動チェック。
function HearingBox({ dealId, initial, initiallyDone }: { dealId: string; initial: string; initiallyDone: boolean }) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(initiallyDone)
  const [savedMsg, setSavedMsg] = useState('')

  async function save() {
    setSaving(true); setSavedMsg('')
    try {
      const res = await fetch(`/api/app/deals/${dealId}/hearing`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setDone(!!j.done); setSavedMsg('保存しました。MBに共有されます。') }
      else setSavedMsg('保存に失敗しました。時間をおいて再度お試しください。')
    } catch { setSavedMsg('通信に失敗しました。') } finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '15px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: '.8rem', fontWeight: 800 }}>あなたのタスク：ヒヤリング</b>
        {done && <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--green)', background: 'var(--green-bg)', borderRadius: 5, padding: '2px 7px' }}>✓ 完了</span>}
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 10px', lineHeight: 1.6 }}>
        お客さまの状況・ご要望をヒヤリングして入力してください。保存するとMBに共有され、このタスクは自動で完了になります。
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
        placeholder="例：予算感・希望時期・現状の課題・キーマン など"
        style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.82rem', lineHeight: 1.6, resize: 'vertical' }} />
      <button onClick={save} disabled={saving} className="ui-btn ui-btn--primary ui-btn--lg lift" style={{ width: '100%', marginTop: 8 }}>
        {saving ? '保存中…' : '保存する'}
      </button>
      {savedMsg && <p style={{ fontSize: '.64rem', color: savedMsg.includes('失敗') ? 'var(--red)' : 'var(--green)', margin: '8px 0 0', fontWeight: 700 }}>{savedMsg}</p>}
    </div>
  )
}

// ── AI紹介文ドラフト（既存 /api/ai/draft-intro を流用・生成＆コピーのみ・お金/作成に非関与）──
function AiIntroPanel({ defaultContact, defaultService, defaultNeed }: { defaultContact: string; defaultService: string; defaultNeed: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState(defaultContact)
  const [need, setNeed] = useState(defaultNeed)
  const [service, setService] = useState(defaultService)
  const [tone, setTone] = useState('丁寧')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/ai/draft-intro').then(r => r.ok ? r.json() : { enabled: false }).then(j => { if (alive) setEnabled(!!j.enabled) }).catch(() => { if (alive) setEnabled(false) })
    return () => { alive = false }
  }, [])

  async function generate() {
    setErr(''); setBusy(true); setCopied(false)
    try {
      const res = await fetch('/api/ai/draft-intro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact, need, service, tone }) })
      const j = await res.json().catch(() => ({}))
      if (j?.disabled) { setEnabled(false); return }
      if (!res.ok) { setErr(j?.error || '生成に失敗しました。時間をおいて再度お試しください。'); return }
      setDraft(j.draft || '')
    } catch { setErr('通信に失敗しました。時間をおいて再度お試しください。') } finally { setBusy(false) }
  }

  if (!enabled) return null

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="lift"
        style={{ width: '100%', background: '#fff', border: '1px dashed var(--line)', borderRadius: 13, padding: '13px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-blue)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 4.8L12 14.6 8 16.8l1-4.8L5.5 9l4.6-1.4L12 3z"/></svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 800 }}>AIで送る文面を作る</span>
          <span style={{ display: 'block', fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, lineHeight: 1.5 }}>相手とニーズを入れると、送る文面の下書きを作成します。</span>
        </span>
        <span style={{ color: 'var(--muted)', fontSize: '.9rem', flexShrink: 0 }}>›</span>
      </button>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '16px 18px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: '.8rem', fontWeight: 800 }}>AIで送る文面を作る</b>
        <button type="button" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.66rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
      </div>
      <div className="fld"><label>紹介先の相手（企業・担当者）</label>
        <input value={contact} onChange={e => setContact(e.target.value)} placeholder="例：株式会社〇〇 山田様" /></div>
      <div className="fld"><label>相手の課題・ニーズ</label>
        <textarea value={need} onChange={e => setNeed(e.target.value)} rows={2} placeholder="例：採用がうまくいかず、母集団形成に課題がある"
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.85rem', resize: 'vertical' }} /></div>
      <div className="fld"><label>紹介したいサービス（任意）</label>
        <input value={service} onChange={e => setService(e.target.value)} placeholder="例：採用支援サービス" /></div>
      <div className="fld"><label>トーン（任意）</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['丁寧', 'カジュアル', 'フォーマル'].map(t => (
            <button type="button" key={t} onClick={() => setTone(t)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${tone === t ? 'var(--c-blue)' : 'var(--line)'}`, background: tone === t ? 'var(--c-blue)' : '#fff', color: tone === t ? '#fff' : 'var(--txt)' }}>{t}</button>
          ))}
        </div>
      </div>
      <button type="button" onClick={generate} disabled={busy} className="ui-btn ui-btn--primary ui-btn--lg lift" style={{ width: '100%', marginTop: 2 }}>
        {busy ? '生成中…' : (draft ? '作り直す' : '生成する')}
      </button>
      {err && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '10px 0 0', lineHeight: 1.6 }}>{err}</p>}
      {draft && (
        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 6 }}>生成結果（編集できます）</label>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={8}
            style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontFamily: 'inherit', fontSize: '.82rem', lineHeight: 1.7, resize: 'vertical' }} />
          <button type="button" onClick={() => draft && navigator.clipboard?.writeText(draft).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })} className="lift"
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
      ctx!.fillStyle = '#fff'; ctx!.fillRect(px + S, py + S, S * 5, S * 5)
      ctx!.fillStyle = '#4733E6'; ctx!.fillRect(px + S * 2, py + S * 2, S * 3, S * 3)
    }
    eye(0, 0); eye(c.width - S * 7, 0); eye(0, c.height - S * 7)
  }, [linkUrl])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(4px)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 320, textAlign: 'center' }}>
        <h3 style={{ fontSize: '.92rem', fontWeight: 900, marginBottom: 4 }}>紹介QRコード</h3>
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginBottom: 14 }}>{linkUrl.replace(/^https?:\/\//, '')}</p>
        <canvas ref={canvasRef} width={220} height={220} style={{ border: '1px solid var(--line)', borderRadius: 12, marginBottom: 14 }} />
        <button onClick={() => { const c = canvasRef.current; if (!c) return; const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'MB_Partners_QR.png'; a.click() }} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', padding: 11, fontSize: '.76rem' }}>保存する</button>
        <div onClick={onClose} style={{ marginTop: 8, fontSize: '.7rem', color: 'var(--muted2)', cursor: 'pointer', fontWeight: 500 }}>閉じる</div>
      </div>
    </div>
  )
}
