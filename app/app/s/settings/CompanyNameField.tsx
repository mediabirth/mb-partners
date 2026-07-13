'use client'
/** 会社名（法人名）のインライン編集（v9・即時反映=シェル/一覧/請求の表示名に全域反映）。 */
import { useState } from 'react'

export default function CompanyNameField({ initial, fallback }: { initial: string; fallback: string }) {
  const [val, setVal] = useState(initial)
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  async function save() {
    if (busy) return
    setBusy(true)
    const r = await fetch('/api/supplier/self', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company_name: val }) })
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); setEdit(false); setTimeout(() => location.reload(), 600) }
    setBusy(false)
  }
  if (!edit) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <b style={{ fontWeight: 500 }}>{val || fallback}</b>
      <button onClick={() => setEdit(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.64rem', color: 'var(--c-blue)', padding: 0 }}>{saved ? '✓' : val ? '変更' : '登録'}</button>
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input value={val} onChange={e => setVal(e.target.value)} placeholder="株式会社〇〇" autoFocus
        style={{ border: '0.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: '.78rem', width: 200 }} />
      <button disabled={busy} onClick={save} className="ui-btn ui-btn--primary" style={{ fontSize: '.64rem', padding: '6px 12px' }}>{busy ? '…' : '保存'}</button>
    </span>
  )
}
