'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

// SYNAPSE 一覧（簡素化）：個人/法人タブ撤去・検索なし・「話して追加」撤去。
// 各行＝名前＋個人/法人タグ＋補助1行＋進行中のみステータス。本質的に必要な情報のみ整然と。
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
  id: string; name: string; company: string | null; service: string | null
  status: string; statusKey: string; amount: number | null; date: string; entity: 'individual' | 'corporate'
}

const oneLine: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

export default function SynapseClient({ initialContacts, referred }: { initialContacts: SynapseContact[]; referred: ReferredEntry[]; aiEnabled: boolean }) {
  const [prospects, setProspects] = useState<SynapseContact[]>(initialContacts)
  const [adding, setAdding] = useState<null | { name: string; company: string }>(null); const [addErr, setAddErr] = useState(''); const [addBusy, setAddBusy] = useState(false)

  const prospectEntity = (c: SynapseContact): 'individual' | 'corporate' => c.entity_type === 'individual' ? 'individual' : c.entity_type === 'corporate' ? 'corporate' : (c.company ? 'corporate' : 'individual')

  type Entry = { key: string; kind: 'referred' | 'prospect'; name: string; entity: 'individual' | 'corporate'; sub: string; status: string | null; href: string; date: string }
  const entries = useMemo(() => {
    const ref: Entry[] = referred.map(r => ({
      key: 'd' + r.id, kind: 'referred', name: r.name, entity: r.entity, sub: r.service ?? '案件',
      status: r.status === '進行' ? '進行中' : null,   // 進行中（動いている）時のみステータス
      href: '/app/refer', date: r.date,
    }))
    const pro: Entry[] = prospects.map(c => {
      const entity = prospectEntity(c)
      const sub = entity === 'individual' ? ([c.role, c.company].filter(Boolean).join('・') || '—') : (c.industry || c.company || '未取得')
      return { key: 'c' + c.id, kind: 'prospect' as const, name: c.name ?? c.company ?? '名称未設定', entity, sub, status: null, href: `/app/synapse/${c.id}`, date: c.created_at }
    })
    return [...ref, ...pro].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [referred, prospects])

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
      {/* 見出し＋＋追加 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' }}>
        <h1 style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-.01em' }}>あなたのつながり <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)' }}>{entries.length}</span></h1>
        <button onClick={() => { setAdding({ name: '', company: '' }); setAddErr('') }} className="lift" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 800 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>追加
        </button>
      </div>

      {/* リスト：密な区切り行 */}
      <div>
        {entries.length === 0 ? (
          <p style={{ padding: '30px 20px', textAlign: 'center', fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{'ここに、あなたが繋いだ人・これから繋ぐ人が並びます。\n右上の「＋追加」から始めましょう。'}</p>
        ) : (
          <>
            {entries.map(e => (
              <Link key={e.key} href={e.href} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 20px', borderTop: '1px solid var(--line)', textDecoration: 'none', color: 'var(--txt)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: '.82rem', fontWeight: 700, ...oneLine, flexShrink: 1 }}>{e.name}</span>
                    <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: e.entity === 'corporate' ? 'var(--blue)' : 'var(--muted2)', background: e.entity === 'corporate' ? 'var(--blue-bg)' : 'var(--bg2)', borderRadius: 5, padding: '1px 6px' }}>{e.entity === 'corporate' ? '法人' : '個人'}</span>
                  </div>
                  <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2, ...oneLine }}>{e.sub}</div>
                </div>
                {e.status && <span style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--amber)', flexShrink: 0 }}>{e.status}</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            ))}
            <div style={{ borderTop: '1px solid var(--line)' }} />
          </>
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
