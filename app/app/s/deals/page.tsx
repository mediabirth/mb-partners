'use client'
/**
 * 案件（サプライヤー・コンソール）: 自社案件テーブル＋成約案件への受注額入力（本人化・2026-07-13）。
 * データ/境界/記録は /api/supplier/self（セッションスコープ・audit＋コンソール案件タイムラインに出所記録）。
 */
import { useEffect, useMemo, useState } from 'react'
import PageGuide from '@/components/PageGuide'
import { SG_DEALS } from '@/lib/supplier-guides'
import { DEAL_STATUS } from '@/lib/status'

type Deal = { id: string; customer: string; status: string; brand: string; created_at: string; revenue: number; item_id: string | null; from_network: boolean }
const FILTERS = [['all', 'すべて'], ['received', '受付'], ['in_progress', '対応中'], ['confirmed', '成約'], ['paid', '支払済']] as const

export default function SupplierDealsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const load = () => fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(d => setDeals(d?.deals ?? [])).catch(() => setDeals([]))
  useEffect(() => { load() }, [])
  const rows = useMemo(() => (deals ?? []).filter(d => filter === 'all' || d.status === filter), [deals, filter])
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  async function saveRevenue(d: Deal) {
    const v = Number((draft[d.id] ?? String(d.revenue || '')).replace(/[,，\s]/g, ''))
    if (!Number.isFinite(v) || v <= 0) { say('受注額を入力してください'); return }
    setBusy(d.id)
    const r = await fetch('/api/supplier/self', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deal_id: d.id, revenue: v }) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? '受注額を保存しました（MBに記録・通知されます）' : (j.error ?? '失敗しました'))
    if (r.ok) await load()
    setBusy('')
  }

  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 980, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>案件</h1>
        <PageGuide data={SG_DEALS} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 500, minHeight: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${filter === v ? 'var(--c-blue)' : 'var(--line)'}`, background: filter === v ? 'var(--blue-bg2)' : '#fff', color: filter === v ? 'var(--c-blue)' : 'var(--muted2)' }}>{l}</button>
        ))}
      </div>
      <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>{['お客さま', 'メニュー', '紹介', '状態', '受注額（税抜）'].map(h => <th key={h} style={{ textAlign: 'left', fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', padding: '9px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {deals === null ? (
                <tr><td colSpan={5} style={{ padding: '16px 12px', fontSize: '.72rem', color: 'var(--muted2)' }}>読み込み中…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '16px 12px', fontSize: '.72rem', color: 'var(--muted2)' }}>該当する案件はありません。</td></tr>
              ) : rows.map(d => {
                const editable = d.status === 'confirmed' || d.status === 'paid'
                return (
                  <tr key={d.id}>
                    <td style={{ fontSize: '.74rem', fontWeight: 500, padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{d.customer}</td>
                    <td style={{ fontSize: '.68rem', color: 'var(--muted2)', padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{d.brand}</td>
                    <td style={{ fontSize: '.62rem', color: 'var(--muted2)', padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{d.from_network ? 'あなたの網' : 'MB側'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 9px' }}>{DEAL_STATUS[d.status]?.label ?? d.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>
                      {editable ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input inputMode="numeric" value={draft[d.id] ?? (d.revenue ? String(d.revenue) : '')} placeholder="未入力"
                            onChange={e => setDraft(p => ({ ...p, [d.id]: e.target.value }))}
                            style={{ width: 110, minHeight: 34, padding: '0 9px', borderRadius: 8, border: d.revenue ? '0.5px solid var(--line)' : '1.5px solid var(--amber)', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right' }} />
                          <button disabled={busy === d.id} onClick={() => saveRevenue(d)} style={{ fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 500, minHeight: 34, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--c-blue)' }}>{busy === d.id ? '…' : '保存'}</button>
                        </span>
                      ) : (
                        <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>成約後に入力</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '10px 2px 0' }}>{toast}</p>}
    </div>
  )
}
