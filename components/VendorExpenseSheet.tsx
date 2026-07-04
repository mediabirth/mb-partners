'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Opt = { id: string; label: string; base_fee?: number }
const KINDS = ['交通', '宿泊', 'その他']

// 経費申請シート（共通）— 中央＋FAB / 案件詳細 から呼ばれる。
// 「カメラで撮影」と「ファイルを選択」は独立した2ボタン＋撮影/選択後サムネ。送信は既存 /api/vendor/expenses。
export default function VendorExpenseSheet({ open, onClose, presetAssignmentId, presetLabel }: {
  open: boolean; onClose: () => void; presetAssignmentId?: string; presetLabel?: string
}) {
  const router = useRouter()
  const [opts, setOpts] = useState<Opt[]>(presetAssignmentId ? [{ id: presetAssignmentId, label: presetLabel ?? '案件' }] : [])
  const [assignmentId, setAssignmentId] = useState(presetAssignmentId ?? '')
  const [kind, setKind] = useState('交通')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const camRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => {
    if (!open || presetAssignmentId) return
    fetch('/api/vendor/assignments').then(r => r.json()).then(d => {
      setOpts(d.assignments ?? [])
      if (!assignmentId && d.assignments?.[0]) setAssignmentId(d.assignments[0].id)
    }).catch(() => {})
  }, [open, presetAssignmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  function pick(f: File | null) {
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }
  function reset() { setAmount(''); setFile(null); if (preview) URL.revokeObjectURL(preview); setPreview(null); setKind('交通') }
  async function submit() {
    const amt = Math.max(0, Number((amount || '').replace(/[,，\s]/g, '')))
    if (!assignmentId) { show('案件を選択してください'); return }
    if (!amt) { show('金額を入力してください'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('delivery_assignment_id', assignmentId); fd.append('kind', kind); fd.append('amount', String(amt))
      if (file) fd.append('file', file)
      const r = await fetch('/api/vendor/expenses', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.expense) { reset(); onClose(); router.refresh() }
      else { show(d.error ?? '申請に失敗しました'); setBusy(false) }
    } catch { show('申請に失敗しました'); setBusy(false) }
  }
  if (!open) return null
  const inp: React.CSSProperties = { width: '100%', border: '0.5px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.86rem', background: '#fff' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: '.64rem', fontWeight: 500, color: 'var(--muted2)', margin: '0 0 6px' }

  return (
    <>
      <style>{`
        .ves-scrim{position:fixed;inset:0;background:rgba(14,14,20,.4);backdrop-filter:blur(2px);z-index:90;animation:vesf .14s ease}
        .ves-sheet{position:fixed;left:0;right:0;bottom:0;z-index:95;background:#fff;border-radius:20px 20px 0 0;padding:14px 20px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -16px 48px rgba(14,14,20,.22);animation:vesu .16s cubic-bezier(.2,.8,.2,1);max-height:92dvh;overflow-y:auto}
        .ves-grip{width:40px;height:4px;border-radius:3px;background:var(--line);margin:0 auto 14px}
        @keyframes vesu{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes vesf{from{opacity:0}to{opacity:1}}
        @media (min-width:520px){.ves-sheet{left:50%;transform:translate(-50%,-50%);top:50%;bottom:auto;width:440px;border-radius:18px;max-height:88dvh;animation:vesf .14s ease}}
      `}</style>
      <div className="ves-scrim" onClick={onClose} />
      <div className="ves-sheet" role="dialog" aria-label="経費を申請">
        <div className="ves-grip" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <b style={{ fontSize: '1rem' }}>経費を申請</b>
          <button onClick={onClose} aria-label="閉じる" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg2)', color: 'var(--muted2)', fontSize: '.95rem', cursor: 'pointer' }}>✕</button>
        </div>

        <label style={lbl}>対象案件</label>
        {presetAssignmentId ? (
          <div style={{ ...inp, marginBottom: 14, color: 'var(--txt)', background: 'var(--bg2)' }}>{presetLabel ?? '案件'}</div>
        ) : (
          <select value={assignmentId} onChange={e => setAssignmentId(e.target.value)} disabled={busy} style={{ ...inp, marginBottom: 14 }}>
            {opts.length === 0 && <option value="">担当案件がありません</option>}
            {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}

        <label style={lbl}>種別</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {KINDS.map(k => (
            <button key={k} onClick={() => setKind(k)} disabled={busy} style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontFamily: 'inherit', fontSize: '.78rem', fontWeight: kind === k ? 500 : 400, cursor: 'pointer', border: kind === k ? '1.5px solid var(--blue)' : '0.5px solid var(--line)', background: kind === k ? 'var(--blue-bg)' : '#fff', color: kind === k ? 'var(--blue)' : 'var(--txt)' }}>{k}</button>
          ))}
        </div>

        <label style={lbl}>金額（円）</label>
        <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="例：15000" disabled={busy} style={{ ...inp, marginBottom: 14, fontFamily: 'Inter' }} />

        <label style={lbl}>領収書（任意）</label>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={e => pick(e.target.files?.[0] ?? null)} disabled={busy} style={{ display: 'none' }} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={e => pick(e.target.files?.[0] ?? null)} disabled={busy} style={{ display: 'none' }} />
        {preview ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '0.5px solid var(--line)', borderRadius: 12, padding: 10, marginBottom: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="プレビュー" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8 }} />
            <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file?.name}</span>
            <button onClick={() => pick(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.9rem' }}>✕</button>
          </div>
        ) : file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '0.5px solid var(--line)', borderRadius: 12, padding: '12px 12px', marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted2)" strokeWidth="1.7" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
            <button onClick={() => pick(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.9rem' }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => camRef.current?.click()} disabled={busy} className="ui-btn ui-btn--secondary ui-btn--md" style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
              カメラで撮影
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="ui-btn ui-btn--secondary ui-btn--md" style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
              ファイルを選択
            </button>
          </div>
        )}

        <button onClick={submit} disabled={busy || !assignmentId} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }}>{busy ? '送信中…' : '申請する'}</button>
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 10, fontSize: '.74rem', fontWeight: 500, zIndex: 130 }}>{toast}</div>}
    </>
  )
}
