'use client'
// 業務委託先（デリバリー種別）— パートナーページの「デリバリー」タブに統合。旧 /console/deliveries の内容そのまま。
import { useEffect, useState } from 'react'

type Delivery = { id: string; name: string; kind: string | null; contact_email: string | null; note: string | null; active: boolean; auth_user_id?: string | null }

export default function DeliveriesPanel() {
  const [list, setList] = useState<Delivery[]>([])
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    fetch('/api/console/deliveries').then(r => r.json()).then(d => { setList(d.deliveries ?? []); setReady(d.ready !== false) }).catch(() => {}).finally(() => setLoading(false))
  }, [])
  function show(m: string) { setToast(m); setTimeout(() => setToast(''), 2200) }

  async function add() {
    if (!name.trim()) { show('名称は必須です'); return }
    const r = await fetch('/api/console/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kind, contact_email: email }) })
    const d = await r.json()
    if (d.delivery) { setList(p => [...p, d.delivery]); setName(''); setKind(''); setEmail(''); show('追加しました') }
    else if (d.needsMigration) show('テーブル未作成（batchA2a DDL 実行が必要）')
    else show(d.error ?? '追加に失敗しました')
  }
  async function patch(id: string, body: Partial<Delivery>) {
    const r = await fetch(`/api/console/deliveries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json(); if (d.delivery) setList(p => p.map(x => x.id === id ? d.delivery : x)); else show(d.error ?? '更新に失敗しました')
  }
  async function del(id: string) {
    if (!confirm('この委託先を削除しますか？')) return
    const r = await fetch(`/api/console/deliveries/${id}`, { method: 'DELETE' })
    if (r.ok) { setList(p => p.filter(x => x.id !== id)); show('削除しました') } else show('削除に失敗しました')
  }
  async function invite(d: Delivery) {
    const e = window.prompt(`「${d.name}」を業務委託先ポータルに招待します。\n委託先のメールアドレスを入力してください。`, d.contact_email ?? '')
    if (!e?.trim()) return
    const r = await fetch(`/api/console/deliveries/${d.id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e.trim() }) })
    const data = await r.json().catch(() => ({}))
    if (r.ok && data.invite_url) {
      try { await navigator.clipboard.writeText(data.invite_url) } catch { /* clipboard 不可でもURLは表示 */ }
      window.prompt('招待URLを発行しました（クリップボードにコピー済み）。委託先へ共有してください：', data.invite_url)
      show('招待URLを発行しました')
    } else if (data.needsMigration) show('vendor用DBの適用が必要です（batchC1 DDL）')
    else show(data.error ?? '招待に失敗しました')
  }
  const inp: React.CSSProperties = { border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.78rem', background: '#fff' }

  return (
    <div style={{ maxWidth: 760 }}>
      {!ready && (
        <div style={{ background: 'var(--amber-bg)', borderRadius: 10, padding: '12px 14px', fontSize: '.72rem', color: '#7A5A14', marginBottom: 18 }}>
          テーブル未作成です。<b>docs/reports/batchA2a_all_ddl.sql</b> を Supabase で実行すると有効になります。
        </div>
      )}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px', marginBottom: 22, display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="名称（例: 田中フォト）" style={{ ...inp, flex: 1, minWidth: 160 }} />
        <input value={kind} onChange={e => setKind(e.target.value)} placeholder="種別（カメラマン等）" style={{ ...inp, width: 160 }} />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="連絡先メール（任意）" style={{ ...inp, width: 180 }} />
        <button onClick={add} className="btn btn-p" style={{ fontSize: '.74rem', padding: '8px 16px' }}>追加</button>
      </div>
      {loading ? <p style={{ fontSize: '.78rem', color: 'var(--muted2)' }}>読み込み中…</p> : list.length === 0 ? (
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>委託先がありません。</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          {list.map((d, i) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < list.length - 1 ? '1px solid #F2F2F6' : 'none', opacity: d.active ? 1 : .5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700 }}>{d.name}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>{d.kind ?? '—'}{d.contact_email ? ` · ${d.contact_email}` : ''}</div>
              </div>
              {d.auth_user_id
                ? <span title="ポータル連携済み" style={{ fontSize: '.56rem', fontWeight: 700, borderRadius: 20, padding: '2px 9px', color: 'var(--green)', background: 'var(--green-bg)' }}>連携済み</span>
                : <button onClick={() => invite(d)} style={{ fontSize: '.6rem', fontWeight: 700, borderRadius: 20, padding: '3px 11px', border: '1px solid var(--green)', cursor: 'pointer', color: 'var(--green)', background: '#fff' }}>招待</button>}
              <button onClick={() => patch(d.id, { active: !d.active })} style={{ fontSize: '.58rem', fontWeight: 700, borderRadius: 20, padding: '2px 9px', border: 'none', cursor: 'pointer', color: d.active ? 'var(--green)' : 'var(--muted)', background: d.active ? 'var(--green-bg)' : 'var(--bg2)' }}>{d.active ? '有効' : '無効'}</button>
              <button onClick={() => del(d.id)} style={{ fontSize: '.7rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99 }}>{toast}</div>}
    </div>
  )
}
