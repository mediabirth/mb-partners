'use client'
import { useEffect, useState } from 'react'

// v3.1：タスク説明の最小編集UI。ラベル単位で cooperation_task_templates.description を一括更新
// （/api/console/task-templates PATCH）。保存→APP登録ページのⓘポップオーバーに反映。★money/タスク判定に非接触。
export default function TaskDescriptionEditor() {
  const [rows, setRows] = useState<{ label: string; description: string }[]>([])
  const [savingLabel, setSavingLabel] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/console/task-templates').then(r => r.json()).then(d => {
      const seen = new Map<string, string>()
      for (const t of (d.templates ?? []) as { label: string; description: string | null }[]) {
        if (!seen.has(t.label)) seen.set(t.label, t.description ?? '')
      }
      setRows([...seen].map(([label, description]) => ({ label, description })))
    }).catch(() => {})
  }, [])

  async function save(label: string, description: string) {
    setSavingLabel(label)
    try {
      const r = await fetch('/api/console/task-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, description }) })
      setToast(r.ok ? `「${label}」の説明を保存しました` : '保存に失敗しました')
    } catch { setToast('通信に失敗しました') } finally { setSavingLabel(null); setTimeout(() => setToast(''), 2500) }
  }

  if (rows.length === 0) return null
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 40px' }}>
      <details style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 500, listStyle: 'none' }}>タスクの説明を編集（登録ページのⓘに表示）</summary>
        <p style={{ fontSize: 12, color: 'var(--muted2)', margin: '8px 0 14px', lineHeight: 1.6 }}>
          各タスク名の説明です。保存するとパートナーの登録ページのⓘに反映されます。
        </p>
        {rows.map(r => (
          <div key={r.label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{r.label}</div>
            <textarea value={r.description} onChange={e => setRows(p => p.map(x => x.label === r.label ? { ...x, description: e.target.value } : x))} rows={2}
              style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
            <button onClick={() => save(r.label, r.description)} disabled={savingLabel === r.label}
              style={{ marginTop: 6, fontSize: 12, fontWeight: 500, color: '#fff', background: 'var(--c-blue)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', opacity: savingLabel === r.label ? 0.5 : 1 }}>
              {savingLabel === r.label ? '保存中…' : '保存'}
            </button>
          </div>
        ))}
        {toast && <p style={{ fontSize: 12, color: 'var(--muted2)', margin: 0 }}>{toast}</p>}
      </details>
    </div>
  )
}
