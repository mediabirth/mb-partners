'use client'
/**
 * サプライヤーからの請求（P0-a・仕様正典: docs/design/lineage-rate-design.md v2）。
 * 情報再構造化: 旧 /console/supplier-charges の全機能をそのまま「支払」のタブへ移設（処理ロジック・API不変）。
 * MBが「請求する」側＝パートナーへの支払（MBが払う）と同一画面の別タブで扱う。
 */
import { useEffect, useMemo, useState } from 'react'

type Supplier = { id: string; name: string; code: string | null; rate_card: string }
type Charge = { id: string; supplier_partner_id: string; deal_id: string | null; kind: string; period: string; base_amount: number; rate: number | null; amount: number; status: string; frozen_at: string; snapshot: { customer?: string } | null }
type Preview = { rows: { kind: string; base_amount: number; amount: number; snapshot: { customer?: string } }[]; warnings: string[] }

const KIND_JP: Record<string, string> = { half_commission: '折半手数料（粗利50%）', passthrough_revenue_fee: '販売手数料（受注額5%・報酬はパススルー）', payment_fee_5: '決済手数料（5%）', omnis_monthly: '月額（ファウンディング）' }
const ST: Record<string, { label: string; bg: string; fg: string }> = {
  unbilled: { label: '未請求', bg: 'rgba(242,151,27,.12)', fg: '#b26a09' },
  invoiced: { label: '請求済', bg: 'rgba(86,70,230,.10)', fg: '#4733e6' },
  settled: { label: '入金済', bg: 'rgba(21,145,126,.12)', fg: '#0f9d76' },
}
const yen = (n: number) => `¥${Number(n || 0).toLocaleString()}`
const prevMonth = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function SupplierChargesPanel() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [supplier, setSupplier] = useState('')
  const [period, setPeriod] = useState(prevMonth())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = () => fetch('/api/console/supplier-charges').then(r => r.json()).then(d => {
    setSuppliers(d.suppliers ?? []); setCharges(d.charges ?? [])
    if (!supplier && d.suppliers?.[0]) setSupplier(d.suppliers[0].id)
  })
  useEffect(() => { load().finally(() => setLoading(false)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPreview() {
    if (!supplier || !period) return
    setBusy(true); setNote('')
    const d = await fetch(`/api/console/supplier-charges?supplier=${supplier}&period=${period}`).then(r => r.json()).catch(() => null)
    setPreview(d?.preview ?? null); setBusy(false)
  }
  async function freeze() {
    if (!supplier || !period || busy) return
    if (!confirm(`${period} 分を締めて凍結しますか？凍結後の入力変更はこの請求額に影響しません。`)) return
    setBusy(true)
    const r = await fetch('/api/console/supplier-charges', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplier_partner_id: supplier, period }) })
    const d = await r.json().catch(() => ({}))
    setNote(r.ok ? `凍結 ${d.frozen}件（スキップ ${d.skipped}件）${(d.warnings ?? []).length ? ` ／ 警告: ${d.warnings.join(' / ')}` : ''}` : (d.error ?? '失敗しました'))
    setPreview(null); await load(); setBusy(false)
  }
  async function act(id: string, action: 'invoice' | 'settle' | 'delete') {
    if (busy) return
    if (action === 'delete' && !confirm('この凍結を解除しますか？（未請求のみ）')) return
    setBusy(true)
    const r = action === 'delete'
      ? await fetch(`/api/console/supplier-charges/${id}`, { method: 'DELETE' })
      : await fetch(`/api/console/supplier-charges/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setNote(d.error ?? '失敗しました') }
    await load(); setBusy(false)
  }
  function exportCsv() {
    const head = 'period,supplier,kind,customer,base_amount,rate,amount(税抜),status,frozen_at'
    const nameOf = (id: string) => suppliers.find(s => s.id === id)?.name ?? id
    const lines = charges.map(c => [c.period, nameOf(c.supplier_partner_id), KIND_JP[c.kind] ?? c.kind, c.snapshot?.customer ?? '', c.base_amount, c.rate ?? '', c.amount, ST[c.status]?.label ?? c.status, c.frozen_at].join(','))
    const blob = new Blob(['﻿' + [head, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `supplier_charges.csv`; a.click()
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Charge[]>()
    for (const c of charges) { const k = `${c.period}|${c.supplier_partner_id}`; m.set(k, [...(m.get(k) ?? []), c]) }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [charges])
  const nameOf = (id: string) => suppliers.find(s => s.id === id)?.name ?? id
  const codeOf = (id: string) => suppliers.find(s => s.id === id)?.code ?? null

  const TH: React.CSSProperties = { textAlign: 'left', fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '8px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { fontSize: '.7rem', padding: '9px 12px', borderBottom: '0.5px solid var(--line)', verticalAlign: 'top' }

  return (
    <>
      {loading ? <div className="ui-skeleton" style={{ height: 120, borderRadius: 14 }} /> : suppliers.length === 0 ? (
        <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--muted2)', fontSize: '.78rem' }}>
          サプライヤーが未登録です。パートナー一覧のサプライヤータブで昇格し、サービスマスタでブランドに供給元を結線すると、ここに請求が集計されます。
        </div>
      ) : (
        <>
          {/* 月次クローズ */}
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 18 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, marginBottom: 10 }}>月次クローズ（金額の凍結）</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={supplier} onChange={e => { setSupplier(e.target.value); setPreview(null) }} style={{ fontSize: '.74rem', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)' }}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.rate_card === 'omnis-founding-v1' ? '（ファウンディング）' : ''}</option>)}
              </select>
              <input type="month" value={period} onChange={e => { setPeriod(e.target.value); setPreview(null) }} style={{ fontSize: '.74rem', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)' }} />
              <button onClick={fetchPreview} disabled={busy} className="ui-btn ui-btn--secondary" style={{ fontSize: '.72rem', padding: '8px 14px' }}>プレビュー</button>
              <button onClick={freeze} disabled={busy || !preview} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '8px 14px' }}>この月を締める（凍結）</button>
              <button onClick={exportCsv} disabled={charges.length === 0} className="ui-btn ui-btn--ghost" style={{ fontSize: '.72rem', padding: '8px 14px' }}>CSV出力</button>
            </div>
            {preview && (
              <div style={{ marginTop: 12, fontSize: '.7rem' }}>
                {preview.rows.length === 0 ? <span style={{ color: 'var(--muted2)' }}>この月に凍結対象はありません。</span> : (
                  <>
                    {preview.rows.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px dashed var(--line)' }}>
                        <span>{KIND_JP[r.kind] ?? r.kind}{r.snapshot?.customer ? ` ・ ${r.snapshot.customer}` : ''}</span>
                        <b style={{ fontFamily: 'Inter' }}>{yen(r.amount)} <span style={{ color: 'var(--muted2)', fontWeight: 400 }}>（税抜）</span></b>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0 0', fontWeight: 800 }}>
                      <span>合計（税抜・消費税は請求書側で加算）</span><span style={{ fontFamily: 'Inter' }}>{yen(preview.rows.reduce((s, r) => s + r.amount, 0))}</span>
                    </div>
                  </>
                )}
                {preview.warnings.length > 0 && preview.warnings.map((w, i) => <p key={i} style={{ color: 'var(--amber)', marginTop: 6 }}>⚠ {w}</p>)}
              </div>
            )}
            {note && <p style={{ marginTop: 10, fontSize: '.68rem', color: 'var(--muted2)' }}>{note}</p>}
          </div>

          {/* 凍結済み一覧 */}
          {grouped.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '38px 24px', textAlign: 'center', color: 'var(--muted2)', fontSize: '.74rem' }}>まだ凍結済みの請求がありません</div>
          ) : grouped.map(([key, list]) => {
            const [p, sid] = key.split('|')
            const total = list.reduce((s, c) => s + c.amount, 0)
            return (
              <div key={key} style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--bg2)', fontSize: '.72rem', fontWeight: 700 }}>
                  {/* ①名前表記: 氏名（会社名）主体＋補助のコード小 */}
                  <span>{p} ・ {nameOf(sid)}{codeOf(sid) && <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 500, marginLeft: 6 }}>{codeOf(sid)}</span>}</span>
                  <span style={{ fontFamily: 'Inter' }}>計 {yen(total)}（税抜）</span>
                </div>
                <div className="ctable-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                    <thead><tr><th style={TH}>種別</th><th style={TH}>お客さま</th><th style={TH}>ベース</th><th style={TH}>請求額（税抜）</th><th style={TH}>状態</th><th style={TH}>操作</th></tr></thead>
                    <tbody>
                      {list.map(c => (
                        <tr key={c.id}>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>{KIND_JP[c.kind] ?? c.kind}</td>
                          <td style={TD}>{c.snapshot?.customer ?? '—'}</td>
                          <td style={{ ...TD, fontFamily: 'Inter', whiteSpace: 'nowrap' }}>{yen(c.base_amount)}{c.rate != null && <span style={{ color: 'var(--muted2)' }}> × {Math.round(c.rate * 100)}%</span>}</td>
                          <td style={{ ...TD, fontFamily: 'Inter', fontWeight: 700, whiteSpace: 'nowrap' }}>{yen(c.amount)}</td>
                          <td style={TD}><span style={{ fontSize: '.58rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: ST[c.status]?.bg, color: ST[c.status]?.fg }}>{ST[c.status]?.label ?? c.status}</span></td>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                            {c.status === 'unbilled' && <>
                              <button onClick={() => act(c.id, 'invoice')} disabled={busy} style={{ fontSize: '.6rem', fontWeight: 700, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer', marginRight: 6 }}>請求済みにする</button>
                              <button onClick={() => act(c.id, 'delete')} disabled={busy} style={{ fontSize: '.6rem', color: 'var(--muted2)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>凍結解除</button>
                            </>}
                            {c.status === 'invoiced' && <button onClick={() => act(c.id, 'settle')} disabled={busy} style={{ fontSize: '.6rem', fontWeight: 700, color: '#fff', background: 'var(--green)', border: 'none', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>入金済みにする</button>}
                            {c.status === 'settled' && <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </>
      )}
    </>
  )
}
