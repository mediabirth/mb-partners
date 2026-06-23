'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import SynapseCrest from './SynapseCrest'

// SYNAPSE 一覧（名簿＝資産）：個人/法人タブ撤去・検索なし・「話して追加」撤去。
// 各行＝左端に個人/法人タグ＋主(法人=会社名/個人=氏名)＋副(担当者・業種 or 役職・所属)＋chevron。行のステータスタグは撤去。
// ★紹介履歴 read-only。書込は synapse_contacts のみ（本人スコープAPI）。再度紹介＝/app/refer deep-linkのみ。

export type SynapseContact = {
  id: string
  name: string | null; company: string | null; industry: string | null; role: string | null
  relationship: string | null; needs: string | null; notes: string | null
  suggested_service: string | null; suggested_angle: string | null
  acted_at: string | null; enriched_at: string | null
  url: string | null; company_size: string | null; scanned_at: string | null
  entity_type: string | null; phone: string | null; address: string | null
  demand_summary: string | null; demand_tags: string[] | null; recommended_services: string[] | null
  source: string; created_at: string; updated_at: string
}
export type ReferredEntry = {
  id: string; name: string | null; company: string | null; person: string | null; service: string | null
  status: string; statusKey: string; date: string; entity: 'individual' | 'corporate'
}

const oneLine: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function SynapseClient({ initialContacts, referred = [] }: { initialContacts: SynapseContact[]; referred?: ReferredEntry[]; aiEnabled: boolean }) {
  const [prospects, setProspects] = useState<SynapseContact[]>(initialContacts)
  const [adding, setAdding] = useState<null | { name: string; company: string }>(null); const [addErr, setAddErr] = useState(''); const [addBusy, setAddBusy] = useState(false)

  const prospectEntity = (c: SynapseContact): 'individual' | 'corporate' => c.entity_type === 'individual' ? 'individual' : c.entity_type === 'corporate' ? 'corporate' : (c.company ? 'corporate' : 'individual')

  // 一覧＝台帳(synapse_contacts)＋過去に紹介した顧客(deal由来・重複は集約済み)を統合。
  // ★B-2：全行が必ず詳細へ。台帳→/app/synapse/[uuid]（編集可）。deal由来→/app/synapse/deal-<dealId>（read-only詳細）。
  //   /app/refer へ直行する行は作らない（③遷移バグの根絶を維持）。件数経路に money/amount/reward は一切含めない。
  type Entry = { key: string; main: string; entity: 'individual' | 'corporate'; sub: string; href: string; date: string }
  const entries = useMemo(() => {
    const ledger: Entry[] = prospects.map(c => {
      const entity = prospectEntity(c)
      const corp = entity === 'corporate'
      const main = (corp ? (c.company || c.name) : (c.name || c.company)) || '名称未設定'
      const sub = (corp ? [c.name, c.industry] : [c.role, c.company]).filter(Boolean).join('・') || (corp ? '未取得' : '—')
      return { key: 'c' + c.id, main, entity, sub, href: `/app/synapse/${c.id}`, date: c.created_at }
    })
    const deals: Entry[] = referred.map(r => {
      const corp = r.entity === 'corporate'
      const main = (corp ? (r.company || r.name) : (r.name || r.company)) || '紹介した顧客'
      const sub = [corp ? r.person : null, r.service].filter(Boolean).join('・') || '紹介済み'
      return { key: 'd' + r.id, main, entity: r.entity, sub, href: `/app/synapse/deal-${r.id}`, date: r.date }
    })
    return [...ledger, ...deals].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [prospects, referred])

  async function saveAdd() {
    if (!adding) return
    if (!`${adding.name}${adding.company}`.trim()) { setAddErr('名前か会社を入力してください'); return }
    setAddBusy(true); setAddErr('')
    try {
      const res = await fetch('/api/synapse/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: adding.name, company: adding.company, source: 'manual' }) })
      const j = await res.json().catch(() => ({})); if (!res.ok) { setAddErr(j?.error || '保存に失敗しました'); return }
      setProspects(prev => [j.contact as SynapseContact, ...prev]); setAdding(null)
    } catch { setAddErr('保存に失敗しました') } finally { setAddBusy(false) }
  }

  return (
    <div style={{ padding: '4px 0 24px' }}>
      {/* A1. ヒーロー：紋章＋件数（表示のみ・money非依存）＋資産の一言 */}
      <div style={{ margin: '14px 20px 16px', display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(135deg, var(--blue-bg) 0%, var(--blue-bg2) 70%)', border: '1px solid var(--blue-bg)', borderRadius: 18, padding: '18px 18px' }}>
        <div style={{ flexShrink: 0 }}><SynapseCrest size={74} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.54rem', fontWeight: 900, letterSpacing: '.16em', color: 'var(--blue)' }}>SYNAPSE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: '1.9rem', fontWeight: 900, letterSpacing: '-.02em', color: 'var(--blue-dk)', lineHeight: 1 }}>{entries.length}</span>
            <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--muted2)' }}>のつながり</span>
          </div>
          <p style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.6 }}>繋いだ人・これから繋ぐ人が、あなたの資産になる。</p>
        </div>
      </div>

      {/* A2. リストカード：先頭行「すべてのつながり」＋＋追加。各行＝区分色のノード点＋主＋タグ＋副＋chevron。 */}
      <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px 12px' }}>
          <b style={{ fontSize: '.78rem', fontWeight: 800 }}>すべてのつながり</b>
          <button onClick={() => { setAdding({ name: '', company: '' }); setAddErr('') }} className="lift" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 800 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>追加
          </button>
        </div>
        {entries.length === 0 ? (
          <p style={{ padding: '24px 20px 30px', textAlign: 'center', fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8, whiteSpace: 'pre-line', borderTop: '1px solid var(--line)' }}>{'ここに、あなたが繋いだ人・これから繋ぐ人が並びます。\n右上の「＋追加」から始めましょう。'}</p>
        ) : (
          entries.map(e => {
            const corp = e.entity === 'corporate'
            const dot = corp ? 'var(--blue)' : 'var(--muted2)'
            return (
              <Link key={e.key} href={e.href} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderTop: '1px solid var(--line)', textDecoration: 'none', color: 'var(--txt)' }}>
                {/* 左端＝区分色のノード点 */}
                <span style={{ flexShrink: 0, width: 9, height: 9, borderRadius: '50%', background: dot, boxShadow: `0 0 0 3px ${corp ? 'var(--blue-bg)' : 'var(--bg2)'}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ fontSize: '.82rem', fontWeight: 700, ...oneLine }}>{e.main}</span>
                    <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: dot, background: corp ? 'var(--blue-bg)' : 'var(--bg2)', borderRadius: 5, padding: '2px 6px' }}>{corp ? '法人' : '個人'}</span>
                  </div>
                  <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2, ...oneLine }}>{e.sub}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            )
          })
        )}
      </div>

      {/* 追加（最小フォーム） */}
      {adding && (
        <div onClick={ev => { if (ev.target === ev.currentTarget) setAdding(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 430, borderRadius: '16px 16px 0 0', padding: '18px 18px calc(20px + env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <b style={{ fontSize: '.86rem', fontWeight: 800 }}>つながりを追加</b>
              <button onClick={() => setAdding(null)} style={{ background: 'none', border: 'none', color: 'var(--muted2)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>閉じる</button>
            </div>
            <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>まず名前だけでもOK。詳細ページから会社URLを渡せばSYNAPSEが埋めます。</p>
            {([['お名前', 'name'], ['会社・組織', 'company']] as const).map(([label, key]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 4 }}>{label}</label>
                <input value={adding[key]} onChange={ev => setAdding(a => a ? { ...a, [key]: ev.target.value } : a)} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.8rem' }} />
              </div>
            ))}
            {addErr && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '0 0 8px' }}>{addErr}</p>}
            <button onClick={saveAdd} disabled={addBusy} className="btn btn-p lift" style={{ width: '100%' }}>{addBusy ? '保存中…' : '名簿に追加'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
