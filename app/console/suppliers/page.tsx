'use client'
/**
 * サプライヤー一覧（Feature I・完全UI化）。1行1社の静音リスト＋「サプライヤーに昇格」フロー。
 * 定義＝供給ブランド結線 or レートカード付与のあるフロンティア（会社）パートナー。
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ConsoleNav from '@/components/ConsoleNav'
import ConsoleMain from '@/components/ConsolePageTransition'
import PageGuide from '@/components/PageGuide'
import { GUIDE_SUPPLIERS } from '@/lib/console-guides'

type Supplier = { id: string; code: string; name: string; status: string; tax_type: string | null; rate_card: string; brands: { id: string; name: string }[]; lineage_count: number }
type Card = { id: string; name: string; monthly_fee: number | null; payment_fee_rate: number | null; half_commission_rate: number; override_rate: number; fee_model?: string; revenue_fee_rate?: number | null; deprecated?: boolean }
// カード経済の要約（fee_model駆動・Feature I-2）
const cardSummary = (c: Card) => c.fee_model === 'passthrough'
  ? `パススルー＋受注額${Math.round((c.revenue_fee_rate ?? 0.05) * 100)}%／決済${Math.round((c.payment_fee_rate ?? 0) * 100)}%／override${Math.round(c.override_rate * 100)}%`
  : `折半${Math.round(c.half_commission_rate * 100)}%／${c.monthly_fee != null ? `月額¥${Number(c.monthly_fee).toLocaleString()}` : `決済${Math.round((c.payment_fee_rate ?? 0) * 100)}%`}／override${Math.round(c.override_rate * 100)}%`
const yen = (n: number) => `¥${Number(n || 0).toLocaleString()}`

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [estimate, setEstimate] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [frontiers, setFrontiers] = useState<{ id: string; name: string; code: string }[]>([])
  const [selPartner, setSelPartner] = useState('')
  const [selCard, setSelCard] = useState('standard-v2')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const ym = new Date().toISOString().slice(0, 7)

  const load = async () => {
    const [s, c] = await Promise.all([
      fetch('/api/console/suppliers').then(r => r.json()),
      fetch('/api/console/rate-cards').then(r => r.json()),
    ])
    setSuppliers(s.suppliers ?? []); setCards(c.cards ?? [])
    // 当月請求見込み（各サプライヤーのクローズプレビュー合計）
    const est: Record<string, number> = {}
    for (const sp of (s.suppliers ?? []) as Supplier[]) {
      try {
        const d = await fetch(`/api/console/supplier-charges?supplier=${sp.id}&period=${ym}`).then(r => r.json())
        est[sp.id] = ((d?.preview?.rows ?? []) as { amount: number }[]).reduce((a, r) => a + Number(r.amount), 0)
      } catch { est[sp.id] = 0 }
    }
    setEstimate(est)
  }
  useEffect(() => { load().finally(() => setLoading(false)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function openPromote() {
    setPromoteOpen(true); setNote('')
    // 候補＝is_frontier かつ 未サプライヤーのパートナー（console API経由・SQL不要）
    const res = await fetch('/api/console/suppliers/candidates').then(r => r.json()).catch(() => ({ candidates: [] }))
    setFrontiers(res.candidates ?? [])
    setSelPartner(res.candidates?.[0]?.id ?? '')
  }
  async function promote() {
    if (!selPartner || busy) return
    const cardName = cards.find(c => c.id === selCard)?.name ?? selCard
    if (!confirm(`このフロンティアをサプライヤーに昇格します。\n\n・適用レートカード: ${cardName}\n・以後、系統×メニューの組み合わせで手数料（パススルー+受注額5%／折半／決済／月額／override）が自動判定されます\n・確定済み・凍結済みの案件には波及しません\n\nよろしいですか？`)) return
    setBusy(true)
    const r = await fetch('/api/console/suppliers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ partner_id: selPartner, rate_card_id: selCard }) })
    const j = await r.json().catch(() => ({}))
    setNote(r.ok ? (j.warning ? `昇格しました ／ ⚠ ${j.warning}` : '昇格しました') : (j.error ?? '失敗しました'))
    if (r.ok) { setPromoteOpen(false); await load() }
    setBusy(false)
  }

  const cardName = (id: string) => cards.find(c => c.id === id)?.name ?? id
  const TH: React.CSSProperties = { textAlign: 'left', fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '9px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { fontSize: '.72rem', padding: '11px 12px', borderBottom: '0.5px solid var(--line)' }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500 }}>サプライヤー</h1><PageGuide data={GUIDE_SUPPLIERS} /></span>
          <button onClick={openPromote} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '8px 16px' }}>＋ サプライヤーに昇格</button>
        </div>

        <div style={{ padding: '24px 28px 44px', maxWidth: 1000 }}>
          {loading ? <div className="ui-skeleton" style={{ height: 120, borderRadius: 14 }} /> : suppliers.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--muted2)', fontSize: '.78rem' }}>
              サプライヤーが未登録です。「サプライヤーに昇格」からフロンティア（会社）パートナーを昇格できます。
            </div>
          ) : (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead><tr><th style={TH}>社名</th><th style={TH}>レートカード</th><th style={TH}>状態</th><th style={TH}>供給ブランド</th><th style={TH}>系統パートナー</th><th style={TH}>当月請求見込み</th></tr></thead>
                  <tbody>
                    {suppliers.map(sp => (
                      <tr key={sp.id}>
                        <td style={{ ...TD, fontWeight: 700 }}>
                          <Link href={`/console/suppliers/${sp.id}`} style={{ color: 'var(--txt)', textDecoration: 'none' }}>{sp.name}</Link>
                          <span style={{ color: 'var(--muted2)', fontWeight: 400, fontSize: '.62rem' }}> ({sp.code})</span>
                        </td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{cardName(sp.rate_card)}</td>
                        <td style={TD}>
                          <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: sp.status === 'active' ? 'rgba(21,145,126,.12)' : 'var(--bg2)', color: sp.status === 'active' ? '#0f9d76' : 'var(--muted2)' }}>{sp.status === 'active' ? '契約中' : '停止'}</span>
                        </td>
                        <td style={{ ...TD, fontFamily: 'Inter' }}>{sp.brands.length}</td>
                        <td style={{ ...TD, fontFamily: 'Inter' }}>{sp.lineage_count}</td>
                        <td style={{ ...TD, fontFamily: 'Inter', whiteSpace: 'nowrap' }}>{estimate[sp.id] != null ? yen(estimate[sp.id]) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {note && <p style={{ marginTop: 10, fontSize: '.7rem', color: 'var(--muted2)' }}>{note}</p>}
        </div>

        {promoteOpen && (
          <>
            <div onClick={() => setPromoteOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 420, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.9rem' }}>サプライヤーに昇格</b>
              <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '6px 0 14px', lineHeight: 1.7 }}>フロンティア（会社）パートナーを選び、適用レートカードを設定します。</p>
              <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)' }}>フロンティア</label>
              <select value={selPartner} onChange={e => setSelPartner(e.target.value)} style={{ width: '100%', margin: '5px 0 12px', padding: '9px 11px', borderRadius: 9, border: '0.5px solid var(--line)', fontSize: '.8rem', fontFamily: 'inherit' }}>
                {frontiers.length === 0 && <option value="">候補なし（先にフロンティア設定）</option>}
                {frontiers.map(f => <option key={f.id} value={f.id}>{f.name}（{f.code}）</option>)}
              </select>
              <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)' }}>レートカード</label>
              <select value={selCard} onChange={e => setSelCard(e.target.value)} style={{ width: '100%', margin: '5px 0 16px', padding: '9px 11px', borderRadius: 9, border: '0.5px solid var(--line)', fontSize: '.8rem', fontFamily: 'inherit' }}>
                {cards.filter(c => !c.deprecated).map(c => <option key={c.id} value={c.id}>{c.name}（{cardSummary(c)}）</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPromoteOpen(false)} className="ui-btn ui-btn--ghost" style={{ fontSize: '.72rem', padding: '8px 14px' }}>キャンセル</button>
                <button onClick={promote} disabled={busy || !selPartner} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '8px 14px' }}>{busy ? '処理中…' : '昇格する'}</button>
              </div>
              {note && <p style={{ marginTop: 10, fontSize: '.66rem', color: 'var(--amber)' }}>{note}</p>}
            </div>
          </>
        )}
      </ConsoleMain>
    </div>
  )
}
