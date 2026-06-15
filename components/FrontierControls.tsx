'use client'
import { useState } from 'react'

// R2-B: パートナー編集の「役割（フロンティア）」＋「紐づくフロンティア」設定。
export default function FrontierControls({ partnerId, initialIsFrontier, initialFrontierId, frontiers }: {
  partnerId: string
  initialIsFrontier: boolean
  initialFrontierId: string | null
  frontiers: { id: string; name: string; code: string }[]
}) {
  const [isFrontier, setIsFrontier] = useState(initialIsFrontier)
  const [frontierId, setFrontierId] = useState(initialFrontierId ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function patch(body: Record<string, unknown>) {
    setSaving(true); setMsg('')
    try {
      const r = await fetch(`/api/console/partners/${partnerId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setMsg(d.error || '保存に失敗しました'); return false }
      setMsg('保存しました'); return true
    } catch { setMsg('保存に失敗しました'); return false } finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
      <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 12 }}>役割 / フロンティア</b>

      {/* 役割 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 6 }}>役割</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([[false, '通常パートナー'], [true, 'フロンティア']] as const).map(([v, l]) => (
            <button key={l} type="button" disabled={saving}
              onClick={async () => { const ok = await patch({ is_frontier: v }); if (ok) setIsFrontier(v) }}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${isFrontier === v ? 'var(--blue)' : 'var(--line)'}`,
                background: isFrontier === v ? 'var(--blue)' : '#fff', color: isFrontier === v ? '#fff' : 'var(--txt)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* 紐づくフロンティア */}
      <div>
        <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 6 }}>紐づくフロンティア（任意）</div>
        <select value={frontierId} disabled={saving}
          onChange={async e => { const v = e.target.value; const ok = await patch({ frontier_id: v || null }); if (ok) setFrontierId(v) }}
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.8rem' }}>
          <option value="">なし</option>
          {frontiers.filter(f => f.id !== partnerId).map(f => (
            <option key={f.id} value={f.id}>{f.name}（{f.code}）</option>
          ))}
        </select>
        <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 6 }}>設定すると紐づけ日時を記録し、12ヶ月間オーバーライド対象になります。</p>
      </div>

      {msg && <p style={{ fontSize: '.66rem', color: msg.includes('しました') ? 'var(--green)' : 'var(--red)', marginTop: 10 }}>{msg}</p>}
    </div>
  )
}
