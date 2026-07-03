'use client'
import { useEffect, useRef, useState } from 'react'
import BookingDrawer from '@/components/BookingDrawer'

// v2 案件ページ：「次にやること」（アポ型のみ・1.5px accent＝1画面唯一の特権枠）。連絡型は静かな状態カード。
// ★ヒヤリングは TaskChecklist（タスク行直下）へ移設。リンクは /book/partnerCode を表示するだけ。money非接触。
export default function DealNextActions({
  dealId, method, hasAppointment, bookingUrl, customerEmail,
  serviceName, defaultContact, defaultNeed,
}: {
  dealId: string
  method: 'send' | 'self'
  hasAppointment: boolean
  bookingUrl: string | null
  customerEmail: string | null
  serviceName: string | null
  defaultContact: string
  defaultNeed: string
}) {
  const [showBooking, setShowBooking] = useState(false)
  const [booked, setBooked] = useState<string | null>(null)

  return (
    <div style={{ padding: '4px 20px 0' }}>
      {hasAppointment && method === 'send' && bookingUrl && (
        <NextBox title="お客さまに面談日時調整リンクを送る" desc="お客さまがカレンダーから日時を選べます。">
          <ShareLink url={bookingUrl} serviceName={serviceName} defaultContact={defaultContact} defaultNeed={defaultNeed} />
        </NextBox>
      )}
      {hasAppointment && method === 'self' && (
        <NextBox title="面談日時を予約する" desc="空き枠から日時を選んで、この案件の商談を設定します。">
          {booked ? (
            <p style={{ fontSize: 12, color: 'var(--muted2)', margin: 0 }}>
              商談 {new Date(booked).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} を設定しました
            </p>
          ) : (
            <button onClick={() => setShowBooking(true)} style={{ width: '100%', height: 44, background: 'var(--c-blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>面談日時を予約する</button>
          )}
        </NextBox>
      )}
      {!hasAppointment && (
        <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '14px 15px', marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>MBが対応中です。お客さまへご連絡し、状況はここに表示されます。</p>
        </div>
      )}

      {showBooking && (
        <BookingDrawer dealId={dealId} defaultCustomerEmail={customerEmail}
          onClose={() => setShowBooking(false)} onConfirmed={(at) => { setShowBooking(false); setBooked(at) }} />
      )}
    </div>
  )
}

// 1.5px accent枠（1画面唯一の特権）。見出しは塗りピルでなくテキスト（accent）。
function NextBox({ title, desc, children }: { title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--c-blue)', borderRadius: 14, padding: '15px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-blue)', marginBottom: 3 }}>次にやること</div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3 }}>{title}</div>
      <p style={{ fontSize: 12, color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>{desc}</p>
      {children}
    </div>
  )
}

// URL＋コピー(アイコン)／メール・LINE・QR＝3等分Secondary小／AI＝Tertiaryテキスト。塗り・緑背景は無し。
function ShareLink({ url, serviceName, defaultContact, defaultNeed }: { url: string; serviceName: string | null; defaultContact: string; defaultNeed: string }) {
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  // ① 正式なフルURLをそのまま表示・コピー・送付（相対だと貼付け先で壊れるため）。
  const mailHref = `mailto:?subject=${encodeURIComponent('ご事業に役立つ専門サービスのご紹介')}&body=${encodeURIComponent(['お世話になっております。', '', '下記より詳細をご確認ください。', url, '', '何卒よろしくお願い申し上げます。'].join('\n'))}`
  const lineHref = `https://line.me/R/share?text=${encodeURIComponent(['専門サービスのご紹介です。', url].join('\n'))}`
  const sec: React.CSSProperties = { flex: 1, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'transparent', border: '0.5px solid var(--line)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--txt)', cursor: 'pointer', textDecoration: 'none' }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: '9px 10px 9px 12px', marginBottom: 10 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: 12, fontFamily: 'Inter' }}>{url}</span>
        <button aria-label="コピー" onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: copied ? 'var(--c-blue)' : 'var(--muted2)', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', fontSize: 11 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
          {copied && 'コピー済'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <a href={mailHref} style={sec}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>メール
        </a>
        <a href={lineHref} target="_blank" rel="noopener" style={sec}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#06C755"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.07.7.2.8.5.07.27.05.7.02.97l-.13.8c-.04.24-.2.94.82.51 1.02-.43 5.5-3.24 7.5-5.55C20.6 14.9 22 13.1 22 11c0-4.4-4.5-8-10-8z" /></svg>LINE
        </a>
        <button onClick={() => setShowQR(v => !v)} style={sec}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v.01M14 20h.01M20 20v.01M17 17v.01M20 17h.01" /></svg>QR
        </button>
      </div>
      {showQR && <QRModal linkUrl={url} onClose={() => setShowQR(false)} />}
      <div style={{ marginTop: 6 }}>
        <AiIntroPanel defaultContact={defaultContact} defaultService={serviceName ?? ''} defaultNeed={defaultNeed} />
      </div>
    </>
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
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--c-blue)', fontSize: 13, fontWeight: 500 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 4.8L12 14.6 8 16.8l1-4.8L5.5 9l4.6-1.4L12 3z"/></svg>
        AIで送る文面を作る
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
