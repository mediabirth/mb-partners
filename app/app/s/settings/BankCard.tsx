'use client'
/** 振込先口座（§7・お金ページと同源=partners.bank・変更は口座変更申請=既存 /api/mypage/bank）。 */
import { useState } from 'react'

type Bank = { bank_name?: string; branch_name?: string; account_type?: string; account_number?: string; account_holder?: string } | null

export default function BankCard({ bank }: { bank: Bank }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ bank_name: '', branch_name: '', account_type: '普通', account_number: '', account_holder: '' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  async function submit() {
    if (busy) return
    setBusy(true); setNote('')
    const r = await fetch('/api/mypage/bank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) })
    const j = await r.json().catch(() => ({}))
    setNote(r.ok ? '変更を申請しました（MB Partnersの確認後に反映されます）' : (j.error ?? '申請できませんでした'))
    if (r.ok) setOpen(false)
    setBusy(false)
  }
  const FLD: React.CSSProperties = { width: '100%', minHeight: 40, padding: '0 10px', borderRadius: 8, border: '0.5px solid var(--line)', fontSize: '.74rem', fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, padding: '12px 15px', marginBottom: 4 }}>
      {bank?.bank_name ? (
        <div style={{ fontSize: '.76rem', lineHeight: 1.8 }}>{bank.bank_name} {bank.branch_name}<br />{bank.account_type ?? '普通'} <span className="tnum" style={{ fontFamily: 'Inter' }}>{bank.account_number}</span> ・ {bank.account_holder}</div>
      ) : <p style={{ fontSize: '.72rem', color: 'var(--muted2)', margin: 0 }}>未登録です。</p>}
      <button onClick={() => setOpen(v => !v)} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.66rem', color: 'var(--c-blue)', padding: 0 }}>{open ? '− 閉じる' : '変更を申請する'}</button>
      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <input placeholder="金融機関名" value={f.bank_name} onChange={e => setF(p => ({ ...p, bank_name: e.target.value }))} style={FLD} />
          <input placeholder="支店名" value={f.branch_name} onChange={e => setF(p => ({ ...p, branch_name: e.target.value }))} style={FLD} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={f.account_type} onChange={e => setF(p => ({ ...p, account_type: e.target.value }))} style={{ ...FLD, width: 110, flexShrink: 0 }}>
              <option>普通</option><option>当座</option>
            </select>
            <input placeholder="口座番号" inputMode="numeric" value={f.account_number} onChange={e => setF(p => ({ ...p, account_number: e.target.value }))} style={FLD} />
          </div>
          <input placeholder="口座名義（カナ）" value={f.account_holder} onChange={e => setF(p => ({ ...p, account_holder: e.target.value }))} style={FLD} />
          <button disabled={busy || !f.bank_name || !f.account_number || !f.account_holder} onClick={submit}
            style={{ fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, minHeight: 44, borderRadius: 9, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--c-blue)' }}>{busy ? '送信中…' : '変更を申請する'}</button>
        </div>
      )}
      {note && <p style={{ fontSize: '.64rem', color: 'var(--muted2)', margin: '8px 0 0' }}>{note}</p>}
    </div>
  )
}
