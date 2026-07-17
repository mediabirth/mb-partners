'use client'
/**
 * メニュー別ヒアリング項目エディタ（サービスマスタ内・vendor-redesign後続①）。
 * 例＝投資用マンション: 年収/自己資金/希望エリア、保険: 家族構成/既加入。
 * 保存＝PUT set-semantics（回答が残る項目は自動でinactive保全）。★報酬・moneyには一切非接続（記録専用）。
 */
import { useEffect, useState } from 'react'

type Item = { id?: string; label: string; input_type: 'text' | 'number' | 'select'; options: string; required: boolean; active: boolean }
const TYPE_JP: [Item['input_type'], string][] = [['text', 'テキスト'], ['number', '数値'], ['select', '選択肢']]
const inputStyle: React.CSSProperties = { border: '0.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.76rem', background: '#fff', boxSizing: 'border-box' }

export default function HearingItemsEditor({ menuId }: { menuId: string }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    fetch(`/api/console/menus/${menuId}/hearing-items`).then(r => r.ok ? r.json() : null).then(d => {
      setItems(((d?.items ?? []) as { id: string; label: string; input_type: Item['input_type']; options: string[] | null; required: boolean; active: boolean }[])
        .filter(it => it.active)
        .map(it => ({ id: it.id, label: it.label, input_type: it.input_type, options: Array.isArray(it.options) ? it.options.join('、') : '', required: it.required, active: it.active })))
    }).catch(() => setItems([]))
  }, [menuId])
  const set = (i: number, patch: Partial<Item>) => setItems(p => p!.map((it, j) => j === i ? { ...it, ...patch } : it))
  async function save() {
    if (!items || busy) return
    setBusy(true); setNote('')
    const r = await fetch(`/api/console/menus/${menuId}/hearing-items`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((it, i) => ({ id: it.id, label: it.label, input_type: it.input_type, options: it.input_type === 'select' ? it.options.split(/[、,]/).map(s => s.trim()).filter(Boolean) : null, required: it.required, sort: i, active: true })) }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setItems(((j.items ?? []) as { id: string; label: string; input_type: Item['input_type']; options: string[] | null; required: boolean; active: boolean }[]).filter(it => it.active).map(it => ({ id: it.id, label: it.label, input_type: it.input_type, options: Array.isArray(it.options) ? it.options.join('、') : '', required: it.required, active: it.active })))
      setNote('ヒアリング項目を保存しました（案件の受付・入力画面に反映）')
    } else setNote(j.error ?? '保存に失敗しました')
    setBusy(false)
  }
  if (items === null) return <div className="ui-skeleton" style={{ height: 44, borderRadius: 10, marginTop: 16 }} />
  return (
    <div style={{ borderTop: '0.5px solid var(--line)', marginTop: 16, paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)' }}>ヒアリング項目（このメニューの案件で確認すること）</span>
        {items.length > 0 && <button type="button" onClick={save} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>{busy ? '保存中…' : '項目を保存'}</button>}
      </div>
      {items.map((it, i) => (
        <div key={it.id ?? `n-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <input value={it.label} onChange={e => set(i, { label: e.target.value })} placeholder="例：年収" style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
          <select value={it.input_type} onChange={e => set(i, { input_type: e.target.value as Item['input_type'] })} style={{ ...inputStyle, width: 92 }}>
            {TYPE_JP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {it.input_type === 'select' && <input value={it.options} onChange={e => set(i, { options: e.target.value })} placeholder="選択肢（、区切り）" style={{ ...inputStyle, flex: 1, minWidth: 130 }} />}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.66rem', color: 'var(--muted2)', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={it.required} onChange={e => set(i, { required: e.target.checked })} style={{ accentColor: 'var(--c-blue)', width: 13, height: 13 }} />必須
          </label>
          <button type="button" title="この項目を外す" onClick={() => setItems(p => p!.filter((_, j) => j !== i))}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.78rem', flexShrink: 0, padding: 2 }}>✕</button>
        </div>
      ))}
      <button type="button" onClick={() => setItems(p => [...(p ?? []), { label: '', input_type: 'text', options: '', required: false, active: true }])}
        style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>＋ 項目を追加</button>
      {note && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '8px 0 0' }}>{note}</p>}
    </div>
  )
}
