'use client'
/**
 * サプライヤー詳細（Feature I）。結線パートナー情報／レートカード付け替え（履歴付き・標準移行の実務）／
 * 供給ブランドの結線・解除／系統パートナー／当月・累計請求（サプライヤー請求と相互リンク）。
 * ★付け替え・結線変更は「以後に確定する案件」のみに適用（凍結済みへは構造的に波及しない＝ripple文言で予告）。
 */
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import ConsoleNav from '@/components/ConsoleNav'
import ConsoleMain from '@/components/ConsolePageTransition'
import PageGuide from '@/components/PageGuide'
import { GUIDE_SUPPLIER_DETAIL } from '@/lib/console-guides'

type Detail = {
  supplier: { id: string; code: string; name: string; email: string | null; status: string; tax_type: string | null; is_frontier: boolean; rate_card: string }
  brands: { id: string; name: string; active: boolean }[]
  lineage: { id: string; code: string; status: string; frontier_linked_at: string | null; profiles: { name: string | null } | null }[]
  history: { event: string; from_card: string | null; to_card: string | null; created_at: string; note: string | null }[]
  charges_month: number; charges_total: number
}
type Card = { id: string; name: string; monthly_fee: number | null; payment_fee_rate: number | null; half_commission_rate: number; override_rate: number; fee_model?: string; revenue_fee_rate?: number | null; deprecated?: boolean }
const cardSummary = (c: Card) => c.fee_model === 'passthrough'
  ? `パススルー＋受注額${Math.round((c.revenue_fee_rate ?? 0.05) * 100)}%／決済${Math.round((c.payment_fee_rate ?? 0) * 100)}%／override${Math.round(c.override_rate * 100)}%`
  : `折半${Math.round(c.half_commission_rate * 100)}%／${c.monthly_fee != null ? `月額¥${Number(c.monthly_fee).toLocaleString()}` : `決済${Math.round((c.payment_fee_rate ?? 0) * 100)}%`}／override${Math.round(c.override_rate * 100)}%`
const yen = (n: number) => `¥${Number(n || 0).toLocaleString()}`
const EV_JP: Record<string, string> = { promoted: '昇格', card_changed: 'カード変更', suspended: '契約停止', resumed: '再開' }

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [d, setD] = useState<Detail | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [allBrands, setAllBrands] = useState<{ id: string; name: string; supplier: string | null }[]>([])
  const [selCard, setSelCard] = useState('')
  const [attachBrand, setAttachBrand] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = async () => {
    const [dd, cc, sup] = await Promise.all([
      fetch(`/api/console/suppliers/${id}`).then(r => r.json()),
      fetch('/api/console/rate-cards').then(r => r.json()),
      fetch('/api/console/suppliers').then(r => r.json()),
    ])
    setD(dd); setCards(cc.cards ?? []); setSelCard(dd?.supplier?.rate_card ?? '')
    // 結線候補ブランド（全サプライヤーの結線状態はsuppliers APIから合成・非結線=MB自社ブランド）
    const owned: Record<string, string> = {}
    for (const s of (sup.suppliers ?? []) as { id: string; brands: { id: string }[] }[]) for (const b of s.brands) owned[b.id] = s.id
    const sv = await fetch('/api/console/services-list').then(r => r.json()).catch(() => ({ services: [] }))
    setAllBrands((sv.services ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name, supplier: owned[s.id] ?? null })))
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeCard() {
    if (!d || !selCard || selCard === d.supplier.rate_card || busy) return
    const to = cards.find(c => c.id === selCard)
    if (!confirm(`レートカードを付け替えます（標準移行オプション）。\n\n・${cardLabel(d.supplier.rate_card)} → ${cardLabel(selCard)}\n・適用されるのは「以後に確定する案件」からです\n・確定済みの fee_snapshot・凍結済みの請求には一切波及しません\n・月額固定（${to?.monthly_fee != null ? 'あり' : 'なし'}）は次回の月次クローズから反映\n\nよろしいですか？`)) return
    setBusy(true)
    const r = await fetch(`/api/console/suppliers/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rate_card_id: selCard }) })
    const j = await r.json().catch(() => ({}))
    setNote(r.ok ? `カードを ${cardLabel(selCard)} に変更しました` : (j.error ?? '失敗'))
    await load(); setBusy(false)
  }
  async function toggleContract() {
    if (!d || busy) return
    const suspend = d.supplier.status === 'active'
    const msg = suspend
      ? '契約を停止します。\n\n・以後、法人override は発生しなくなります（発生済み・凍結済みは不変）\n・このパートナーのAPPログインも停止されます\n\nよろしいですか？'
      : '契約を再開します。以後の案件から override 対象に戻ります。よろしいですか？'
    if (!confirm(msg)) return
    setBusy(true)
    const r = await fetch(`/api/console/suppliers/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: suspend ? 'suspend' : 'resume' }) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setNote(j.error ?? '失敗') }
    await load(); setBusy(false)
  }
  async function attach() {
    if (!attachBrand || busy) return
    if (!confirm(`ブランド「${allBrands.find(b => b.id === attachBrand)?.name}」の供給元をこのサプライヤーに結線します。\n以後に確定する案件から系統判定に反映されます（確定済みには波及しません）。`)) return
    setBusy(true)
    const r = await fetch(`/api/console/services/${attachBrand}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplier_partner_id: id }) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setNote(j.error ?? '失敗') }
    setAttachBrand(''); await load(); setBusy(false)
  }
  async function detach(brandId: string, name: string) {
    if (busy) return
    if (!confirm(`ブランド「${name}」の供給元結線を解除し、MB自社へ戻します。\n以後に確定する案件から反映されます。`)) return
    setBusy(true)
    const r = await fetch(`/api/console/services/${brandId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplier_partner_id: null }) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setNote(j.error ?? '失敗') }
    await load(); setBusy(false)
  }
  const cardLabel = (cid: string) => { const c = cards.find(x => x.id === cid); return c ? c.name : cid }

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 14 }
  const H: React.CSSProperties = { fontSize: '.72rem', fontWeight: 700, marginBottom: 10 }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 30 }}>
          <Link href="/console/suppliers" style={{ fontSize: '.72rem', color: 'var(--muted2)', textDecoration: 'none' }}>← サプライヤー</Link>
          <span style={{ color: 'var(--line)' }}>/</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>{d?.supplier.name ?? '…'}</h1><PageGuide data={GUIDE_SUPPLIER_DETAIL} /></span>
        </div>

        <div style={{ padding: '24px 28px 44px', maxWidth: 860 }}>
          {!d ? <div className="ui-skeleton" style={{ height: 160, borderRadius: 14 }} /> : (
            <>
              <div style={CARD}>
                <div style={H}>結線パートナー</div>
                <div style={{ fontSize: '.74rem', lineHeight: 2 }}>
                  <div>{d.supplier.name} <span style={{ color: 'var(--muted2)' }}>（{d.supplier.code}・{d.supplier.email ?? 'メール未登録'}）</span></div>
                  <div>状態: <b style={{ color: d.supplier.status === 'active' ? '#0f9d76' : 'var(--muted2)' }}>{d.supplier.status === 'active' ? '契約中' : '停止'}</b>
                    ・税区分: {d.supplier.tax_type === 'corporate' ? <b style={{ color: '#0f9d76' }}>法人 ✓</b> : <b style={{ color: 'var(--amber)' }}>⚠ {d.supplier.tax_type ?? '未設定'}（法人へ変更してください＝override支払の源泉誤適用防止）</b>}
                    ・フロンティア: {d.supplier.is_frontier ? '✓' : '⚠ 未設定'}</div>
                </div>
                <button onClick={toggleContract} disabled={busy} className="ui-btn ui-btn--secondary" style={{ fontSize: '.68rem', padding: '7px 14px', marginTop: 8 }}>{d.supplier.status === 'active' ? '契約を停止する' : '契約を再開する'}</button>
              </div>

              <div style={CARD}>
                <div style={H}>適用レートカード（付け替え＝標準移行オプション）</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={selCard} onChange={e => setSelCard(e.target.value)} style={{ padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--line)', fontSize: '.78rem', fontFamily: 'inherit' }}>
                    {cards.filter(c => !c.deprecated || c.id === d.supplier.rate_card).map(c => <option key={c.id} value={c.id}>{c.name}（{cardSummary(c)}）{c.deprecated ? '（廃止）' : ''}</option>)}
                  </select>
                  <button onClick={changeCard} disabled={busy || selCard === d.supplier.rate_card} className="ui-btn ui-btn--primary" style={{ fontSize: '.7rem', padding: '8px 14px' }}>付け替える</button>
                </div>
                {d.history.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: '.64rem', color: 'var(--muted2)', lineHeight: 1.9 }}>
                    {d.history.map((h, i) => <div key={i}>{new Date(h.created_at).toLocaleDateString('ja')} ・ {EV_JP[h.event] ?? h.event}{h.from_card ? `：${h.from_card} → ${h.to_card}` : h.to_card ? `：${h.to_card}` : ''}</div>)}
                  </div>
                )}
              </div>

              <div style={CARD}>
                <div style={H}>供給ブランド（{d.brands.length}）</div>
                {d.brands.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px dashed var(--line)', fontSize: '.74rem' }}>
                    <span>{b.name} <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{b.active ? '公開中' : '停止中'}</span></span>
                    <button onClick={() => detach(b.id, b.name)} disabled={busy} style={{ fontSize: '.6rem', color: 'var(--muted2)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>結線を解除</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <select value={attachBrand} onChange={e => setAttachBrand(e.target.value)} style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '0.5px solid var(--line)', fontSize: '.76rem', fontFamily: 'inherit' }}>
                    <option value="">ブランドを選択して結線…</option>
                    {allBrands.filter(b => b.supplier !== id).map(b => <option key={b.id} value={b.id}>{b.name}{b.supplier ? '（他サプライヤーから付け替え）' : '（MB自社から）'}</option>)}
                  </select>
                  <button onClick={attach} disabled={busy || !attachBrand} className="ui-btn ui-btn--secondary" style={{ fontSize: '.7rem', padding: '8px 14px' }}>結線</button>
                </div>
              </div>

              <div style={CARD}>
                <div style={H}>系統パートナー（{d.lineage.length}）</div>
                {d.lineage.length === 0 ? <p style={{ fontSize: '.7rem', color: 'var(--muted2)' }}>まだいません（フロンティア招待またはパートナー詳細の紐づけで追加）</p> :
                  d.lineage.map(l => <div key={l.id} style={{ fontSize: '.74rem', padding: '5px 0' }}>{l.profiles?.name ?? l.code} <span style={{ color: 'var(--muted2)', fontSize: '.62rem' }}>（{l.code}・{l.status === 'active' ? '稼働中' : l.status}）</span></div>)}
              </div>

              <div style={CARD}>
                <div style={H}>請求</div>
                <div style={{ display: 'flex', gap: 26, fontSize: '.78rem', fontFamily: 'Inter' }}>
                  <span>当月見込み/凍結: <b>{yen(d.charges_month)}</b></span>
                  <span>累計: <b>{yen(d.charges_total)}</b></span>
                </div>
                <Link href="/console/supplier-charges" style={{ display: 'inline-block', marginTop: 8, fontSize: '.7rem', color: 'var(--c-blue)' }}>サプライヤー請求（月次クローズ）へ →</Link>
              </div>
              {note && <p style={{ fontSize: '.68rem', color: 'var(--muted2)' }}>{note}</p>}
            </>
          )}
        </div>
      </ConsoleMain>
    </div>
  )
}
