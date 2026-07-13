'use client'
/**
 * 案件（サプライヤー・コンソール）: 自社案件テーブル＋成約案件への受注額入力（本人化・2026-07-13）。
 * データ/境界/記録は /api/supplier/self（セッションスコープ・audit＋コンソール案件タイムラインに出所記録）。
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { SupplierTopbar, CONTENT } from '../SupplierChrome'
import { SG_DEALS } from '@/lib/supplier-guides'
import { DEAL_STATUS } from '@/lib/status'

type Asg = { id: string; status: string | null; base_fee: number | null; delivery_name: string }
type Dlv = { id: string; name: string; active: boolean }
type Deal = { id: string; customer: string; status: string; brand: string; menu_name: string | null; created_at: string; fixed_month: string | null; revenue: number; item_id: string | null; from_network: boolean; frozen: boolean; assignments: Asg[] }
const COLS = [['received', '受付'], ['in_progress', '対応中'], ['confirmed', '成約'], ['paid', '支払済']] as const
const ASG_JP: Record<string, string> = { proposed: '提示中', accepted: '了承済', assigned: '了承済', delivered: '納品済み', declined: '辞退' }
const FILTERS = [['all', 'すべて'], ['received', '受付'], ['in_progress', '対応中'], ['confirmed', '成約'], ['paid', '支払済']] as const

export default function SupplierDealsPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [dlvs, setDlvs] = useState<Dlv[]>([])
  const [asgDlv, setAsgDlv] = useState('')
  const [asgFee, setAsgFee] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [detail, setDetail] = useState<Deal | null>(null)
  const load = () => fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(d => { setDeals(d?.deals ?? []); setDlvs((d?.deliveries ?? []).filter((x: Dlv) => x.active)); if (detail) setDetail((d?.deals ?? []).find((x: Deal) => x.id === detail.id) ?? null) }).catch(() => setDeals([]))
  useEffect(() => { load() }, [])
  const rows = useMemo(() => (deals ?? []).filter(d => filter === 'all' || d.status === filter), [deals, filter])
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  async function assign(d: Deal) {
    const fee = Number(asgFee.replace(/[,，\s]/g, ''))
    if (!asgDlv || !Number.isFinite(fee) || fee <= 0) { say('委託先と委託費を入力してください'); return }
    setBusy('asg')
    const r = await fetch('/api/supplier/self', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'assign', deal_id: d.id, delivery_id: asgDlv, base_fee: fee }) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? '委託を提示しました（受託者の承諾後に進みます）' : (j.error ?? '失敗しました'))
    if (r.ok) { setAsgDlv(''); setAsgFee(''); await load() }
    setBusy('')
  }
  async function saveRevenue(d: Deal) {
    const v = Number((draft[d.id] ?? String(d.revenue || '')).replace(/[,，\s]/g, ''))
    if (!Number.isFinite(v) || v <= 0) { say('受注額を入力してください'); return }
    setBusy(d.id)
    const r = await fetch('/api/supplier/self', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deal_id: d.id, revenue: v }) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? '保存済み・請求計算に反映されます' : (j.error ?? '失敗しました'))
    if (r.ok) await load()
    setBusy('')
  }

  return (
    <div className="page-anim">
      <SupplierTopbar title="案件" guide={SG_DEALS} />
      <div style={{ ...CONTENT }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {FILTERS.map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 500, minHeight: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer', border: `1.5px solid ${filter === v ? 'var(--c-blue)' : 'var(--line)'}`, background: filter === v ? 'var(--blue-bg2)' : '#fff', color: filter === v ? 'var(--c-blue)' : 'var(--muted2)' }}>{l}</button>
        ))}
      </div>
      {/* PC: 案件ボード（コンソール同文法・4列・カードクリック=ドロワー） */}
      <div className="sup-board" style={{ display: 'none', gap: 12, alignItems: 'flex-start', overflowX: 'auto' }}>
        {COLS.map(([key, label]) => {
          const col = (deals ?? []).filter(d => d.status === key)
          return (
            <div key={key} style={{ width: 256, flexShrink: 0, background: 'var(--bg2)', borderRadius: 16, padding: 14, minHeight: 220, border: '0.5px solid var(--line)' }}>
              <div style={{ marginBottom: 12, padding: '2px 2px 0', display: 'flex', alignItems: 'center', gap: 7 }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[key]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{label}</span>
                <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.66rem', color: 'var(--muted2)' }}>{col.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                {col.length === 0 ? <div style={{ fontSize: '.62rem', color: 'var(--muted)', textAlign: 'center', padding: '14px 0' }}>0件</div> : col.map(d => (
                  <button key={d.id} onClick={() => setDetail(d)} className="card-hover"
                    style={{ textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 11, padding: '10px 12px', color: 'var(--txt)' }}>
                    <div style={{ fontSize: '.74rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.customer}</div>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.brand}{d.menu_name ? ` ─ ${d.menu_name}` : ''}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>{d.from_network ? 'あなたのパートナー' : 'MB Partners'}</span>
                      <span className="tnum" style={{ marginLeft: 'auto', fontFamily: 'Inter', fontSize: '.68rem', color: d.revenue ? 'var(--txt)' : 'var(--amber)' }}>{d.revenue ? `¥${d.revenue.toLocaleString()}` : (key === 'confirmed' ? '受注額 未入力' : '—')}</span>
                    </div>
                    {d.assignments.length > 0 && (
                      <div style={{ marginTop: 5, fontSize: '.54rem', color: 'var(--muted2)' }}>委託 {d.assignments.map(a => ASG_JP[a.status ?? 'assigned']).join('・')}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {/* SP: リスト（テーブル） */}
      <div className="sup-list" style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
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
                const editable = d.status === 'confirmed' && !d.frozen
                return (
                  <tr key={d.id} onClick={() => setDetail(d)} style={{ cursor: 'pointer' }} className="row-hover">
                    <td style={{ fontSize: '.74rem', fontWeight: 500, padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{d.customer}</td>
                    <td style={{ fontSize: '.68rem', color: 'var(--muted2)', padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{d.brand}{d.menu_name ? ` ─ ${d.menu_name}` : ''}</td>
                    <td style={{ fontSize: '.62rem', color: 'var(--muted2)', padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>{d.from_network ? 'あなたのパートナー' : 'MB Partnersの紹介'}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[d.status]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                        <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{DEAL_STATUS[d.status]?.label ?? d.status}</span>
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }}>
                      {editable ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          <input inputMode="numeric" value={draft[d.id] ?? (d.revenue ? String(d.revenue) : '')} placeholder="未入力"
                            onChange={e => setDraft(p => ({ ...p, [d.id]: e.target.value }))}
                            style={{ width: 110, minHeight: 34, padding: '0 9px', borderRadius: 8, border: d.revenue ? '0.5px solid var(--line)' : '1.5px solid var(--amber)', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right' }} />
                          <button disabled={busy === d.id} onClick={() => saveRevenue(d)} style={{ fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 500, minHeight: 34, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--c-blue)' }}>{busy === d.id ? '…' : '保存'}</button>
                        </span>
                      ) : (d.status === 'paid' || d.frozen) ? (
                        <span style={{ fontSize: '.7rem' }}>
                          <span className="tnum" style={{ fontFamily: 'Inter' }}>{d.revenue ? `¥${d.revenue.toLocaleString()}` : '—'}</span>
                          <span style={{ fontSize: '.56rem', color: 'var(--muted2)', marginLeft: 6 }}>確定済み</span>
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
      <style>{`@media (min-width:1024px){ .sup-board{display:flex !important} .sup-list{display:none} }`}</style>
      </div>
      {toast && <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '10px 2px 0' }}>{toast}</p>}

      {/* 行タップ→詳細ドロワー（コンソール文法の簡易版・createPortal=page-anim包含ブロック事故回避） */}
      {detail && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
          <div className="exp-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '94vw', background: '#fff', zIndex: 95, boxShadow: '-10px 0 34px rgba(14,14,20,.16)', overflowY: 'auto', padding: '18px 20px 30px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <b style={{ flex: 1, fontSize: '.88rem' }}>{detail.customer}</b>
              <button aria-label="閉じる" onClick={() => setDetail(null)} style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted2)', marginRight: -12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {([['メニュー', detail.menu_name ? `${detail.brand} ─ ${detail.menu_name}` : detail.brand],
               ['紹介経路', detail.from_network ? 'あなたのパートナー' : 'MB Partnersの紹介'],
               ['状態', DEAL_STATUS[detail.status]?.label ?? detail.status],
               ['受付日', new Date(detail.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' })],
               ['成約月', detail.fixed_month ? detail.fixed_month.slice(0, 7).replace('-', '年') + '月' : '—'],
               ['受注額（税抜）', detail.revenue ? `¥${detail.revenue.toLocaleString()}` + ((detail.status === 'paid' || detail.frozen) ? '（確定済み）' : '') : '未入力'],
              ] as const).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--line)', fontSize: '.74rem' }}>
                <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{l}</span><span style={{ textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            {/* 受注額の入力（成約後・未凍結のみ＝v6でドロワーへ集約） */}
            {(detail.status === 'confirmed' && !detail.frozen) && (
              <div style={{ padding: '12px 0', borderBottom: '0.5px solid var(--line)' }}>
                <div style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>受注額（税抜）の入力</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input inputMode="numeric" value={draft[detail.id] ?? (detail.revenue ? String(detail.revenue) : '')} placeholder="未入力"
                    onChange={e => setDraft(p => ({ ...p, [detail.id]: e.target.value }))}
                    style={{ flex: 1, minHeight: 40, padding: '0 10px', borderRadius: 8, border: detail.revenue ? '0.5px solid var(--line)' : '1.5px solid var(--amber)', fontFamily: 'Inter', fontSize: '.76rem', textAlign: 'right', boxSizing: 'border-box' }} />
                  <button disabled={busy === detail.id} onClick={() => saveRevenue(detail)} style={{ fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 500, minHeight: 40, padding: '0 16px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--c-blue)', flexShrink: 0 }}>{busy === detail.id ? '…' : '保存'}</button>
                </div>
              </div>
            )}
            {/* 委託（v6: 自社の委託先へのアサイン提示＝受託者アプリに承諾待ちで表示） */}
            <div style={{ padding: '12px 0', fontSize: '.74rem' }}>
              <div style={{ color: 'var(--muted2)', marginBottom: 6 }}>委託</div>
              {detail.assignments.length === 0 ? <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginBottom: 8 }}>まだ委託はありません</div> : detail.assignments.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: '.7rem' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.delivery_name}</span>
                  {a.base_fee != null && <span className="tnum" style={{ fontFamily: 'Inter', color: 'var(--muted2)' }}>¥{Number(a.base_fee).toLocaleString()}</span>}
                  <span style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 9px', flexShrink: 0 }}>{ASG_JP[a.status ?? 'assigned'] ?? a.status}</span>
                </div>
              ))}
              {dlvs.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <select value={asgDlv} onChange={e => setAsgDlv(e.target.value)} style={{ flex: 1, minWidth: 130, minHeight: 40, padding: '0 8px', borderRadius: 8, border: '0.5px solid var(--line)', fontSize: '.72rem', fontFamily: 'inherit', background: '#fff' }}>
                    <option value="">委託先を選択…</option>
                    {dlvs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <input inputMode="numeric" value={asgFee} onChange={e => setAsgFee(e.target.value)} placeholder="委託費（税抜）" style={{ width: 120, minHeight: 40, padding: '0 10px', borderRadius: 8, border: '0.5px solid var(--line)', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right', boxSizing: 'border-box' }} />
                  <button disabled={busy === 'asg' || !asgDlv || !asgFee} onClick={() => assign(detail)} style={{ fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 500, minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', color: 'var(--c-blue)', background: 'var(--blue-bg2)', flexShrink: 0 }}>提示する</button>
                </div>
              ) : (
                <a href="/app/s/partners" style={{ fontSize: '.64rem', color: 'var(--c-blue)', textDecoration: 'none' }}>委託先を招待する（パートナーページ） →</a>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
